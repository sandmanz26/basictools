export const todayStr = (now = new Date()) => now.toISOString().slice(0, 10)

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const addSeconds = (iso: string | Date, s: number) => new Date(new Date(iso).getTime() + s * 1000)
export const isoNow = () => new Date().toISOString()
