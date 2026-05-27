export function generateReceiptNumber(schoolCode: string, sequence: number): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const seq = String(sequence).padStart(5, "0");
  return `SKULI-${schoolCode.toUpperCase()}-${year}${month}-${seq}`;
}
