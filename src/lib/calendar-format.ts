const FULL_TO_SHORT: Record<string, string> = {
  January: 'Jan',
  February: 'Feb',
  March: 'Mar',
  April: 'Apr',
  May: 'May',
  June: 'Jun',
  July: 'Jul',
  August: 'Aug',
  September: 'Sep',
  October: 'Oct',
  November: 'Nov',
  December: 'Dec',
}

const FULL_MONTH = new RegExp(`\\b(${Object.keys(FULL_TO_SHORT).join('|')})\\b`, 'g')

/** Official month-and-year example uses `month: 'short'` (Oct 2026). */
export function shortenCalendarHeading(headingValue: string) {
  return headingValue.replace(FULL_MONTH, (month) => FULL_TO_SHORT[month] ?? month)
}
