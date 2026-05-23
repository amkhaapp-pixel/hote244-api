/** Normalize PostgreSQL DATE values to YYYY-MM-DD (calendar dates, no timezone shift). */
function toDateString(val) {
  if (val == null) return val;
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const d = val instanceof Date ? val : new Date(val);
  if (Number.isNaN(d.getTime())) return val;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatBookingDates(row) {
  if (!row) return row;
  return {
    ...row,
    check_in: toDateString(row.check_in),
    check_out: toDateString(row.check_out),
  };
}

function formatBookingDatesList(rows) {
  return rows.map(formatBookingDates);
}

module.exports = { toDateString, formatBookingDates, formatBookingDatesList };
