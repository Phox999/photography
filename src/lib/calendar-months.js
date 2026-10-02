const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function calendarDateKey(value) {
  return value.toISOString().slice(0, 10);
}

export function calendarRangeFor(businessDate, monthCount = 4) {
  const match = DATE_PATTERN.exec(businessDate);
  if (!match || !Number.isInteger(monthCount) || monthCount < 1) {
    throw new Error('日曆日期不正確。');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const checkedDate = new Date(Date.UTC(year, month - 1, day));
  if (month < 1 || month > 12 || calendarDateKey(checkedDate) !== businessDate) {
    throw new Error('日曆日期不正確。');
  }

  const firstMonth = new Date(Date.UTC(year, month - 1, 1));
  const months = Array.from({ length: monthCount }, (_, index) =>
    new Date(Date.UTC(firstMonth.getUTCFullYear(), firstMonth.getUTCMonth() + index, 1)),
  );
  const lastMonth = months[months.length - 1];

  return {
    months,
    from: calendarDateKey(months[0]),
    to: calendarDateKey(new Date(Date.UTC(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth() + 1, 0))),
  };
}
