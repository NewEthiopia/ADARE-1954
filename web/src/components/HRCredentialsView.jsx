import React, { useEffect, useMemo, useState } from 'react';
import { get } from '../lib/api.js';

const PAGE_SIZE = 25;
const FILTERS = [
  ['dept', 'All domains'],
  ['level', 'All education levels'],
  ['prog', 'All study modalities'],
  ['audit', 'All audit statuses'],
  ['recType', 'All record types'],
];
const AUDIT_FIELDS = [
  ['name', 'Resolved staff name'],
  ['stId', 'Student ID'],
  ['inst', 'Institution'],
  ['level', 'Education level'],
  ['dept', 'Professional domain'],
  ['origField', 'Original field'],
  ['campus', 'Campus location'],
  ['prog', 'Study modality'],
  ['gradYr', 'Graduation year'],
  ['admYr', 'Admission year'],
];
const COLUMNS = [
  ['sn', 'S.N.'],
  ['name', 'Resolved staff name'],
  ['stId', 'Student ID'],
  ['inst', 'Institution'],
  ['level', 'Education level'],
  ['dept', 'Domain'],
  ['origField', 'Original field'],
  ['campus', 'Campus'],
  ['prog', 'Modality'],
  ['gradYr', 'Grad. year'],
  ['audit', 'Audit status'],
];
const labelValue = value => value == null || String(value).trim() === '' ? '—' : String(value);

function Distribution({ rows, field, title, onSelect }) {
  const values = useMemo(() => {
    const counts = new Map();
    rows.forEach(row => {
      const value = labelValue(row[field]);
      counts.set(value, (counts.get(value) || 0) + 1);
    });
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [field, rows]);
  const max = Math.max(1, ...values.map(([, count]) => count));
  return (
    <section className="hr-card">
      <h3>{title}</h3>
      <div className="hr-bars">
        {values.map(([label, count]) => (
          <button className="hr-bar-row" key={label} onClick={() => onSelect(field, label === '—' ? '' : label)}>
            <span className="hr-bar-label" title={label}>{label}</span>
            <span className="hr-bar-track"><span className="hr-bar-fill" style={{ width: `${count / max * 100}%` }} /></span>
            <strong>{count}</strong>
          </button>
        ))}
        {!values.length && <p className="muted">No matching records.</p>}
      </div>
    </section>
  );
}

function RecordTable({ rows, onSelect }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{COLUMNS.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id} className="hr-record-row" tabIndex={0}
              onClick={() => onSelect(row)} onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(row);
                }
              }}>
              {COLUMNS.map(([field]) => (
                <td key={field}>{labelValue(row[field])}</td>
              ))}
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={COLUMNS.length} className="muted">No records match these filters.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function HRCredentialsView() {
  const [records, setRecords] = useState([]);
  const [loadState, setLoadState] = useState({ loading: true, error: '' });
  const [filters, setFilters] = useState({ q: '', dept: '', level: '', prog: '', audit: '', recType: '' });
  const [tab, setTab] = useState('overview');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let current = true;
    get('/hr/credentials')
      .then(data => {
        if (!current) return;
        setRecords(data.credentials || []);
        setLoadState({ loading: false, error: '' });
      })
      .catch(error => {
        if (current) setLoadState({ loading: false, error: error.message || 'Unable to load HR credentials.' });
      });
    return () => { current = false; };
  }, []);

  const options = useMemo(() => Object.fromEntries(FILTERS.map(([field]) => [
    field,
    [...new Set(records.map(row => String(row[field] ?? '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b)),
  ])), [records]);

  const filtered = useMemo(() => {
    const query = filters.q.trim().toLowerCase();
    return records.filter(row => {
      if (FILTERS.some(([field]) => filters[field] && row[field] !== filters[field])) return false;
      return !query || Object.values(row).some(value => String(value ?? '').toLowerCase().includes(query));
    });
  }, [filters, records]);

  const summary = useMemo(() => ({
    rows: filtered.length,
    primary: filtered.filter(row => row.recType === 'Primary Staff').length,
    profiles: new Set(filtered.map(row => row.name).filter(Boolean)).size,
    complete: filtered.filter(row => row.audit === 'Complete Core').length,
  }), [filtered]);

  const institutions = useMemo(() => {
    const counts = new Map();
    filtered.forEach(row => {
      const name = labelValue(row.inst);
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visibleRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const profileRecords = selected
    ? (selected.name ? records.filter(row => row.name === selected.name) : [selected])
    : [];

  const updateFilter = (field, value) => {
    setFilters(current => ({ ...current, [field]: value }));
    setPage(1);
  };
  const resetFilters = () => {
    setFilters({ q: '', dept: '', level: '', prog: '', audit: '', recType: '' });
    setPage(1);
  };
  const exportCsv = () => {
    const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [COLUMNS.map(([, label]) => quote(label)).join(','),
      ...filtered.map(row => COLUMNS.map(([field]) => quote(row[field])).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'adare-hr-educational-credentials.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  if (loadState.loading) return <div className="panel"><div className="skeleton" style={{ height: 180 }} /></div>;
  if (loadState.error) return <div className="alert error" role="alert">{loadState.error}</div>;

  return (
    <div className="hr-dashboard">
      <header className="hr-heading">
        <div>
          <span className="label">Restricted HR workspace</span>
          <h2>Workforce Credentials Intelligence</h2>
          <p className="muted">Educational credentials report · May 2016 E.C. · {records.length.toLocaleString()} records</p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={exportCsv}>Export filtered CSV</button>
      </header>

      <div className="hr-filters" aria-label="Credential filters">
        <input aria-label="Search credentials" placeholder="Search staff, student ID, field, institution…" value={filters.q}
          onChange={event => updateFilter('q', event.target.value)} />
        {FILTERS.map(([field, label]) => (
          <select key={field} aria-label={label} value={filters[field]}
            onChange={event => updateFilter(field, event.target.value)}>
            <option value="">{label}</option>
            {options[field].map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        ))}
        <button className="btn btn-outline btn-sm" onClick={resetFilters}>Reset filters</button>
      </div>

      <div className="hr-kpis">
        <div className="hr-kpi"><strong>{summary.rows.toLocaleString()}</strong><span>Credential records</span></div>
        <div className="hr-kpi"><strong>{summary.primary.toLocaleString()}</strong><span>Primary staff records</span></div>
        <div className="hr-kpi"><strong>{summary.profiles.toLocaleString()}</strong><span>Named staff profiles</span></div>
        <div className="hr-kpi"><strong>{summary.rows ? (summary.complete / summary.rows * 100).toFixed(1) : '0.0'}%</strong><span>Complete core records</span></div>
      </div>

      <nav className="hr-tabs" aria-label="HR credentials dashboard sections">
        {[
          ['overview', 'Executive overview'],
          ['explorer', 'Credential explorer'],
          ['institutions', 'Institutions & campuses'],
          ['audit', 'Data audit & HR checklist'],
        ].map(([key, label]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="hr-overview">
          <Distribution rows={filtered} field="dept" title="Credentials by professional domain" onSelect={updateFilter} />
          <Distribution rows={filtered} field="level" title="Education level" onSelect={updateFilter} />
          <Distribution rows={filtered} field="prog" title="Study modality" onSelect={updateFilter} />
          <section className="hr-card">
            <h3>Department qualification snapshot</h3>
            <div className="table-wrap"><table>
              <thead><tr><th>Domain</th><th>Diploma / TVET</th><th>Bachelor's</th><th>Master's</th><th>Total</th></tr></thead>
              <tbody>{options.dept.map(dept => {
                const rows = filtered.filter(record => record.dept === dept);
                if (!rows.length) return null;
                return <tr key={dept}><td>{dept}</td>
                  <td>{rows.filter(row => row.level === 'Diploma / TVET / Certificate').length}</td>
                  <td>{rows.filter(row => row.level === "Bachelor's Degree").length}</td>
                  <td>{rows.filter(row => row.level === "Master's Degree").length}</td>
                  <td><strong>{rows.length}</strong></td></tr>;
              })}</tbody>
            </table></div>
          </section>
        </div>
      )}

      {tab === 'explorer' && (
        <section className="hr-card">
          <div className="hr-card-head">
            <div><h3>Credential register</h3><p className="muted">Select a record to inspect all credentials associated with the staff profile.</p></div>
            <span className="tag">{filtered.length.toLocaleString()} records</span>
          </div>
          <RecordTable rows={visibleRows} onSelect={setSelected} />
          <div className="hr-pagination">
            <span>Page {page} of {pageCount} · showing {filtered.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
            <div>
              <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</button>
              <button className="btn btn-outline btn-sm" disabled={page >= pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}>Next</button>
            </div>
          </div>
        </section>
      )}

      {tab === 'institutions' && (
        <div className="hr-overview">
          <section className="hr-card">
            <h3>Feeder institutions</h3>
            <div className="table-wrap"><table><thead><tr><th>Institution</th><th>Records</th></tr></thead>
              <tbody>{institutions.slice(0, 30).map(([name, count]) => <tr key={name}><td>{name}</td><td>{count}</td></tr>)}</tbody>
            </table></div>
          </section>
          <Distribution rows={filtered} field="campus" title="Campus locations" onSelect={(_field, value) => {
            updateFilter('q', value);
            setTab('explorer');
          }} />
        </div>
      )}

      {tab === 'audit' && (
        <div className="hr-overview">
          <section className="hr-card">
            <h3>Credential data completeness</h3>
            <div className="table-wrap"><table><thead><tr><th>Field</th><th>Present</th><th>Missing</th><th>Completeness</th></tr></thead>
              <tbody>{AUDIT_FIELDS.map(([field, label]) => {
                const present = filtered.filter(row => String(row[field] ?? '').trim()).length;
                const percent = filtered.length ? present / filtered.length * 100 : 0;
                return <tr key={field}><td>{label}</td><td>{present}</td><td>{filtered.length - present}</td><td>{percent.toFixed(1)}%</td></tr>;
              })}</tbody>
            </table></div>
          </section>
          <section className="hr-card">
            <h3>Mandatory personnel-file scanning checklist</h3>
            <ul className="hr-checklist">
              <li><strong>First degree:</strong> ESLCE/EHEECE certificate or TVET Level IV / Diploma with COC, degree, and official student copy.</li>
              <li><strong>Second degree:</strong> Bachelor's and Master's degrees, each with official student copies.</li>
              <li><strong>Doctoral degree:</strong> Bachelor's, Master's with student copies, and Ph.D. degree.</li>
              <li><strong>Credentials earned abroad:</strong> letter of equivalence and passport, visa, or residence permit.</li>
              <li><strong>Document gap follow-up:</strong> scan and attach verified credential documents to each personnel file.</li>
            </ul>
          </section>
        </div>
      )}

      {selected && (
        <div className="hr-modal-backdrop" role="presentation" onClick={event => {
          if (event.target === event.currentTarget) setSelected(null);
        }}>
          <section className="hr-modal" role="dialog" aria-modal="true" aria-labelledby="hr-profile-title">
            <div className="hr-card-head">
              <div><span className="label">Staff credential profile</span>
                <h3 id="hr-profile-title">{labelValue(selected.name)}</h3></div>
              <button className="btn btn-outline btn-sm" onClick={() => setSelected(null)}>Close</button>
            </div>
            <p className="muted">All associated records · {profileRecords.length}</p>
            <RecordTable rows={profileRecords} onSelect={() => {}} />
          </section>
        </div>
      )}
    </div>
  );
}
