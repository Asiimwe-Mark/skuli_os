'use client';

import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { formatUGX } from '@/lib/utils/currency';

interface StatCardProps {
  label: string;
  value: number;
  format?: 'currency' | 'number' | 'percent';
  icon: React.ElementType;
  trend?: { value: number; positive: boolean };
  color?: 'amber' | 'emerald' | 'rose' | 'blue';
  delay?: number;
}

function useCountUp(end: number, duration: number = 1000) {
  const [value, setValue] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    startTimeRef.current = null;

    function animate(timestamp: number) {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const progress = Math.min((timestamp - startTimeRef.current) / duration, 1);
      setValue(Math.floor(progress * end));
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    }

    requestAnimationFrame(animate);
  }, [end, duration]);

  return value;
}

export function StatCard({
  label,
  value,
  format = 'number',
  icon: Icon,
  trend,
  color = 'amber',
  delay = 0,
}: StatCardProps) {
  const animatedValue = useCountUp(value);

  const colorMap = {
    amber: 'from-amber-400/20 to-amber-400/5 text-amber-400 border-amber-400/20',
    emerald: 'from-emerald-400/20 to-emerald-400/5 text-emerald-400 border-emerald-400/20',
    rose: 'from-rose-400/20 to-rose-400/5 text-rose-400 border-rose-400/20',
    blue: 'from-blue-400/20 to-blue-400/5 text-blue-400 border-blue-400/20',
  };

  const iconBgMap = {
    amber: 'bg-amber-400/20',
    emerald: 'bg-emerald-400/20',
    rose: 'bg-rose-400/20',
    blue: 'bg-blue-400/20',
  };

  const formattedValue =
    format === 'currency'
      ? formatUGX(animatedValue)
      : format === 'percent'
      ? `${animatedValue}%`
      : animatedValue.toLocaleString();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className={cn(
        'p-5 rounded-xl bg-gradient-to-br border card-lift',
        colorMap[color]
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-400 mb-1">{label}</p>
          <p className="text-2xl font-bold text-foreground count-animate">
            {formattedValue}
          </p>
          {trend && (
            <p
              className={cn(
                'text-xs mt-1',
                trend.positive ? 'text-emerald-400' : 'text-rose-400'
              )}
            >
              {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}% vs last
              term
            </p>
          )}
        </div>
        <div className={cn('p-2.5 rounded-lg', iconBgMap[color])}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </motion.div>
  );
}
