// Flattens stored responses into a spreadsheet-friendly CSV, using shared/survey.json
// for column order. See README ("Column layout") for the exact naming rules.
import { questions, OTHER_ID, optionLabel } from './survey.js';

const escapeCell = (value) => {
  if (value === undefined || value === null) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (rows) => rows.map((r) => r.map(escapeCell).join(',')).join('\r\n') + '\r\n';

/** Column definitions, in survey order: { key, header, get(response) }. */
export function buildColumns() {
  const cols = [
    { key: 'id', header: 'response_id', get: (r) => r.id },
    { key: 'submitted_at', header: 'submitted_at', get: (r) => r.submittedAt },
  ];

  const optionIdsWithOther = (q) => {
    const ids = [...(q.options ?? []).map((o) => o.id)];
    if (q.allowOther) ids.push(OTHER_ID);
    return ids;
  };

  const pushOtherText = (q) => {
    if (!q.allowOther) return;
    cols.push({
      key: `${q.id}__other_text`,
      header: `${q.id}__other_text`,
      get: (r) => r.answers?.[q.id]?.other ?? '',
    });
  };

  const pushNoneFlag = (q) => {
    if (!q.noneOption) return;
    cols.push({
      key: `${q.id}__none`,
      header: `${q.id}__none`,
      get: (r) => {
        const a = r.answers?.[q.id];
        if (!a) return '';
        const isNone =
          a.none === true || (Array.isArray(a.selected) && a.selected.includes(q.noneOption.id));
        return isNone ? 'Yes' : '';
      },
    });
  };

  for (const q of questions) {
    if (q.type === 'select-rank') {
      // One column per option holding its rank number (1 = first), blank if unpicked.
      for (const id of optionIdsWithOther(q)) {
        cols.push({
          key: `${q.id}__${id}`,
          header: `${q.id}__${id} (rank)`,
          get: (r) => {
            const a = r.answers?.[q.id];
            if (!a || !Array.isArray(a.ranking)) return '';
            const at = a.ranking.indexOf(id);
            return at === -1 ? '' : at + 1;
          },
        });
      }
      pushOtherText(q);
      pushNoneFlag(q);
    } else if (q.type === 'multi-select') {
      for (const id of optionIdsWithOther(q)) {
        cols.push({
          key: `${q.id}__${id}`,
          header: `${q.id}__${id}`,
          get: (r) => {
            const a = r.answers?.[q.id];
            return Array.isArray(a?.selected) && a.selected.includes(id) ? 'Yes' : '';
          },
        });
      }
      pushOtherText(q);
      pushNoneFlag(q);
    } else if (q.type === 'select-weight') {
      const ids = [...(q.options ?? []).map((o) => o.id)];
      if (q.allowOther) ids.push(OTHER_ID);
      for (const id of ids) {
        cols.push({
          key: `${q.id}__${id}`,
          header: `${q.id}__${id} (%)`,
          get: (r) => {
            const a = r.answers?.[q.id];
            if (!a || !Array.isArray(a.selected) || !a.selected.includes(id)) return '';
            return a.weights?.[id] ?? '';
          },
        });
      }
      if (q.allowOther) {
        cols.push({
          key: `${q.id}__other_text`,
          header: `${q.id}__other_text`,
          get: (r) => r.answers?.[q.id]?.other ?? '',
        });
      }
      if (q.noneOption) {
        cols.push({
          key: `${q.id}__none`,
          header: `${q.id}__none`,
          get: (r) => {
            const a = r.answers?.[q.id];
            if (!a) return '';
            const isNone =
              a.none === true || (Array.isArray(a.selected) && a.selected.includes(q.noneOption.id));
            return isNone ? 'Yes' : '';
          },
        });
      }
    } else if (q.type === 'radio' || q.type === 'select') {
      cols.push({
        key: q.id,
        header: q.id,
        get: (r) => {
          const a = r.answers?.[q.id];
          if (!a) return '';
          const value = typeof a === 'string' ? a : a.value;
          return value ? optionLabel(q, value) : '';
        },
      });
      if (q.allowOther) {
        cols.push({
          key: `${q.id}__other_text`,
          header: `${q.id}__other_text`,
          get: (r) => {
            const a = r.answers?.[q.id];
            return (a && typeof a === 'object' && a.other) || '';
          },
        });
      }
    } else {
      cols.push({ key: q.id, header: q.id, get: (r) => r.answers?.[q.id] ?? '' });
    }

    if (q.followUp) {
      const fu = q.followUp;
      cols.push({ key: fu.id, header: fu.id, get: (r) => r.answers?.[fu.id] ?? '' });
    }
  }

  cols.push(
    { key: 'started_at', header: 'started_at', get: (r) => r.meta?.startedAt ?? '' },
    { key: 'completed_at', header: 'completed_at', get: (r) => r.meta?.completedAt ?? '' },
    { key: 'user_agent', header: 'user_agent', get: (r) => r.meta?.userAgent ?? '' }
  );

  return cols;
}

export function responsesToCsv(responses) {
  const cols = buildColumns();
  const rows = [cols.map((c) => c.header)];
  for (const r of responses) rows.push(cols.map((c) => c.get(r)));
  return toCsv(rows);
}
