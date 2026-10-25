const dateFormatter = new Intl.DateTimeFormat('en-u-ca-ethiopic-nu-latn', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  timeZone: 'UTC',
});

export const ETHIOPIAN_MONTHS = [
  'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
  'Megabit', 'Miyazya', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume',
];

function dateParts(date) {
  const parts = Object.fromEntries(dateFormatter.formatToParts(date).map(({ type, value }) => [type, value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

export function getEthiopianDate(gregorianDate) {
  const [year, month, day] = gregorianDate.split('-').map(Number);
  return dateParts(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function formatEthiopianDate(gregorianDate) {
  const { year, month, day } = getEthiopianDate(gregorianDate);
  return `${day} ${ETHIOPIAN_MONTHS[month - 1]} ${year} E.C.`;
}

export function getEthiopianMonthDays(year, month, minimumGregorianDate) {
  const days = [];
  const start = Date.UTC(year + 7, 8, 1, 12);
  const end = Date.UTC(year + 8, 9, 1, 12);
  for (let timestamp = start; timestamp < end; timestamp += 86400000) {
    const date = new Date(timestamp);
    const parts = dateParts(date);
    if (parts.year !== year || parts.month !== month) continue;
    const gregorianDate = date.toISOString().slice(0, 10);
    if (gregorianDate >= minimumGregorianDate) days.push({ day: parts.day, gregorianDate });
  }
  return days;
}
