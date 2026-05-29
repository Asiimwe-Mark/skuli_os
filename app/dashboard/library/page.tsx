'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatUGX } from '@/lib/utils/currency';
import { formatDate } from '@/lib/utils/dates';
import { cn } from '@/lib/utils/cn';
import { useSchoolStore } from '@/store/school';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BookOpen,
  Plus,
  Search,
  BookMarked,
  AlertTriangle,
  Wallet,
  Library,
  Send,
} from 'lucide-react';

const FINE_PER_DAY = 500;

interface Book {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  category: string | null;
  total_copies: number;
  available_copies: number;
  shelf_location: string | null;
}

interface Issue {
  id: string;
  book_id: string;
  student_id: string;
  issued_at: string;
  due_date: string;
  returned_at: string | null;
  fine_amount: number | null;
  fine_paid: boolean;
  library_books?: { title: string; author: string | null };
  students?: { full_name: string; admission_number: string };
}

interface Student {
  id: string;
  full_name: string;
  admission_number: string;
}

export default function LibraryPage() {
  const { school } = useSchoolStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [addBookOpen, setAddBookOpen] = useState(false);
  const [issueBookOpen, setIssueBookOpen] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 15;

  // Form state
  const [bookForm, setBookForm] = useState({
    title: '',
    author: '',
    isbn: '',
    category: '',
    total_copies: 1,
    shelf_location: '',
  });

  const [issueForm, setIssueForm] = useState({
    book_id: '',
    student_id: '',
    due_date: '',
  });

  // Fetch books
  const { data: books, isLoading: booksLoading } = useQuery<Book[]>({
    queryKey: ['library-books', school?.id],
    queryFn: async () => {
      const res = await fetch('/api/library/books');
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.data;
    },
    enabled: !!school?.id,
  });

  // Fetch all issues (for KPIs and overdue)
  const { data: issues } = useQuery<Issue[]>({
    queryKey: ['library-issues', school?.id],
    queryFn: async () => {
      const res = await fetch('/api/library/issues');
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.data;
    },
    enabled: !!school?.id,
  });

  // Fetch students for issue modal
  const { data: students } = useQuery<Student[]>({
    queryKey: ['students-lite', school?.id],
    queryFn: async () => {
      const res = await fetch('/api/students?lite=true');
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.data;
    },
    enabled: !!school?.id && issueBookOpen,
  });

  // Add book mutation
  const addBook = useMutation({
    mutationFn: async (data: typeof bookForm) => {
      const res = await fetch('/api/library/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          total_copies: Number(data.total_copies),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library-books'] });
      toast({ title: 'Book added successfully' });
      setAddBookOpen(false);
      setBookForm({ title: '', author: '', isbn: '', category: '', total_copies: 1, shelf_location: '' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  // Issue book mutation
  const issueBook = useMutation({
    mutationFn: async (data: typeof issueForm) => {
      const res = await fetch('/api/library/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library-books'] });
      queryClient.invalidateQueries({ queryKey: ['library-issues'] });
      toast({ title: 'Book issued successfully' });
      setIssueBookOpen(false);
      setIssueForm({ book_id: '', student_id: '', due_date: '' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  // KPIs
  const totalBooks = useMemo(() => books?.reduce((sum, b) => sum + b.total_copies, 0) ?? 0, [books]);
  const booksIssued = useMemo(() => issues?.filter(i => !i.returned_at).length ?? 0, [issues]);
  const overdueItems = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return issues?.filter(i => !i.returned_at && i.due_date < today).length ?? 0;
  }, [issues]);
  const finesCollected = useMemo(() => issues?.reduce((sum, i) => sum + (i.fine_paid ? (i.fine_amount ?? 0) : 0), 0) ?? 0, [issues]);

  // Overdue issues
  const overdueIssues = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return issues?.filter(i => !i.returned_at && i.due_date < today) ?? [];
  }, [issues]);

  // Categories for filter
  const categories = useMemo(() => {
    const cats = new Set(books?.map(b => b.category).filter(Boolean) as string[]);
    return Array.from(cats).sort();
  }, [books]);

  // Filtered books
  const filteredBooks = useMemo(() => {
    if (!books) return [];
    return books.filter(b => {
      const matchesSearch = !search ||
        b.title.toLowerCase().includes(search.toLowerCase()) ||
        b.author?.toLowerCase().includes(search.toLowerCase()) ||
        b.isbn?.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || b.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [books, search, categoryFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredBooks.length / pageSize);
  const paginatedBooks = filteredBooks.slice(page * pageSize, (page + 1) * pageSize);

  if (booksLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Library className="w-6 h-6" />
            Library
          </h1>
          <p className="text-foreground/60 mt-1">Manage books and track issues</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={issueBookOpen} onOpenChange={setIssueBookOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-navy-600">
                <Send className="w-4 h-4 mr-2" />
                Issue Book
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Issue Book to Student</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label>Book</Label>
                  <Select value={issueForm.book_id} onValueChange={v => setIssueForm(f => ({ ...f, book_id: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a book" />
                    </SelectTrigger>
                    <SelectContent>
                      {books?.filter(b => b.available_copies > 0).map(b => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.title} ({b.available_copies} available)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Student</Label>
                  <Select value={issueForm.student_id} onValueChange={v => setIssueForm(f => ({ ...f, student_id: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a student" />
                    </SelectTrigger>
                    <SelectContent>
                      {students?.map(s => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.full_name} ({s.admission_number})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Due Date</Label>
                  <Input
                    type="date"
                    value={issueForm.due_date}
                    onChange={e => setIssueForm(f => ({ ...f, due_date: e.target.value }))}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => issueBook.mutate(issueForm)}
                  disabled={issueBook.isPending || !issueForm.book_id || !issueForm.student_id || !issueForm.due_date}
                >
                  {issueBook.isPending ? 'Issuing...' : 'Issue Book'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={addBookOpen} onOpenChange={setAddBookOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Book
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Book</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label>Title *</Label>
                  <Input
                    value={bookForm.title}
                    onChange={e => setBookForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Book title"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Author</Label>
                    <Input
                      value={bookForm.author}
                      onChange={e => setBookForm(f => ({ ...f, author: e.target.value }))}
                      placeholder="Author name"
                    />
                  </div>
                  <div>
                    <Label>ISBN</Label>
                    <Input
                      value={bookForm.isbn}
                      onChange={e => setBookForm(f => ({ ...f, isbn: e.target.value }))}
                      placeholder="ISBN"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Category</Label>
                    <Input
                      value={bookForm.category}
                      onChange={e => setBookForm(f => ({ ...f, category: e.target.value }))}
                      placeholder="e.g. Fiction, Science"
                    />
                  </div>
                  <div>
                    <Label>Total Copies</Label>
                    <Input
                      type="number"
                      min={1}
                      value={bookForm.total_copies}
                      onChange={e => setBookForm(f => ({ ...f, total_copies: Number(e.target.value) }))}
                    />
                  </div>
                </div>
                <div>
                  <Label>Shelf Location</Label>
                  <Input
                    value={bookForm.shelf_location}
                    onChange={e => setBookForm(f => ({ ...f, shelf_location: e.target.value }))}
                    placeholder="e.g. Shelf A3"
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => addBook.mutate(bookForm)}
                  disabled={addBook.isPending || !bookForm.title}
                >
                  {addBook.isPending ? 'Adding...' : 'Add Book'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border-subtle bg-surface">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-foreground/60">Total Books</p>
              <p className="text-xl font-bold">{totalBooks}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border-subtle bg-surface">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <BookMarked className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-foreground/60">Books Issued</p>
              <p className="text-xl font-bold">{booksIssued}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border-subtle bg-surface">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <p className="text-xs text-foreground/60">Overdue Items</p>
              <p className="text-xl font-bold text-rose-400">{overdueItems}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border-subtle bg-surface">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-foreground/60">Fines Collected</p>
              <p className="text-xl font-bold text-emerald-400">{formatUGX(finesCollected)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Overdue Alerts */}
      {overdueIssues.length > 0 && (
        <Card className="border-rose-500/20 bg-rose-500/5">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-rose-400 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Overdue Books ({overdueIssues.length})
            </h3>
            <div className="space-y-2">
              {overdueIssues.slice(0, 5).map(issue => {
                const daysOverdue = Math.floor(
                  (new Date().getTime() - new Date(issue.due_date).getTime()) / 86400000
                );
                const fine = daysOverdue * FINE_PER_DAY;
                return (
                  <div key={issue.id} className="flex items-center justify-between text-sm bg-rose-500/10 rounded-lg p-3">
                    <div>
                      <span className="font-medium">{issue.students?.full_name}</span>
                      <span className="text-foreground/60 ml-2">({issue.students?.admission_number})</span>
                      <span className="text-foreground/60 ml-2">— {issue.library_books?.title}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-rose-400 font-medium">{daysOverdue} days overdue</p>
                      <p className="text-xs text-foreground/60">Fine: {formatUGX(fine)}</p>
                    </div>
                  </div>
                );
              })}
              {overdueIssues.length > 5 && (
                <p className="text-xs text-foreground/60 text-center">
                  +{overdueIssues.length - 5} more overdue items
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Book Catalog */}
      <Card className="border-border-subtle bg-surface">
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
              <Input
                placeholder="Search by title, author, or ISBN..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0); }}
                className="pl-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={v => { setCategoryFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-xl border border-navy-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-navy-800 border-b border-navy-700">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Title</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Author</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">ISBN</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Category</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Available</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Shelf</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-700/50">
                  {paginatedBooks.map((book, i) => (
                    <motion.tr
                      key={book.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="bg-navy-900 hover:bg-navy-800/50 transition-colors"
                    >
                      <td className="px-4 py-3 text-sm font-medium">{book.title}</td>
                      <td className="px-4 py-3 text-sm text-foreground/70">{book.author || '—'}</td>
                      <td className="px-4 py-3 text-sm text-foreground/70 font-mono">{book.isbn || '—'}</td>
                      <td className="px-4 py-3 text-sm">
                        {book.category ? (
                          <Badge variant="secondary" className="text-xs">{book.category}</Badge>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={cn(
                          'font-medium',
                          book.available_copies === 0 ? 'text-rose-400' : 'text-emerald-400'
                        )}>
                          {book.available_copies}
                        </span>
                        <span className="text-foreground/40"> / {book.total_copies}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground/70">{book.shelf_location || '—'}</td>
                    </motion.tr>
                  ))}
                  {paginatedBooks.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-foreground/40">
                        No books found. Add your first book to get started.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-foreground/60">
                Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filteredBooks.length)} of {filteredBooks.length}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p - 1)}
                  disabled={page === 0}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= totalPages - 1}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
