export function formatUGX(amount: number): string {
  return `UGX ${amount.toLocaleString("en-UG")}`;
}

export function parseUGX(value: string): number {
  return Number(value.replace(/[^0-9.-]+/g, ""));
}
