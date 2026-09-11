export function addCalendarMonth(date: Date) {
  const end = new Date(date);
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
  ).getUTCDate();
  end.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return end;
}

export function addCalendarMonths(date: Date, months: number) {
  if (!Number.isInteger(months) || months < 1)
    throw new Error("months must be a positive integer");
  const end = new Date(date);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
  ).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return end;
}
