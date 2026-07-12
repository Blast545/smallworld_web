// In-app rules reference, rendered from docs/RULES.md (bundled at build time
// via Vite's ?raw import). A tiny markdown renderer keeps us dependency-free.

import type { JSX } from 'react';
import rulesText from '../../docs/RULES.md?raw';

export function Rules({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <div className="rules" role="dialog" aria-label="rules reference">
      <header className="topbar">
        <strong>Rules Reference</strong>
        <button className="ghost" onClick={onClose} aria-label="close rules">
          ✕
        </button>
      </header>
      <div className="rulesbody">{renderMarkdown(rulesText)}</div>
    </div>
  );
}

function renderInline(text: string): (string | JSX.Element)[] {
  // Bold and code spans only — enough for RULES.md.
  const out: (string | JSX.Element)[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    else out.push(<code key={k++}>{tok.slice(1, -1)}</code>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function renderMarkdown(md: string): JSX.Element[] {
  const lines = md.split('\n');
  const out: JSX.Element[] = [];
  let list: string[] = [];
  let table: string[][] = [];
  let key = 0;

  const flushList = (): void => {
    if (list.length > 0) {
      out.push(
        <ul key={key++}>
          {list.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  const flushTable = (): void => {
    if (table.length > 0) {
      const [head, ...rows] = table;
      out.push(
        <div className="tablewrap" key={key++}>
          <table>
            <thead>
              <tr>{head?.map((c, i) => <th key={i}>{renderInline(c)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>{renderInline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      table = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('|')) {
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());
      if (cells.every((c) => /^-*$/.test(c))) continue; // separator row
      table.push(cells);
      continue;
    }
    flushTable();
    if (line.startsWith('- ') || line.startsWith('* ')) {
      list.push(line.slice(2));
      continue;
    }
    if (/^\s+-\s/.test(line)) {
      list.push(line.trim().slice(2));
      continue;
    }
    flushList();
    if (line.startsWith('#')) {
      const level = (line.match(/^#+/) as RegExpMatchArray)[0].length;
      const text = line.replace(/^#+\s*/, '');
      if (level === 1) out.push(<h1 key={key++}>{renderInline(text)}</h1>);
      else if (level === 2) out.push(<h2 key={key++}>{renderInline(text)}</h2>);
      else out.push(<h3 key={key++}>{renderInline(text)}</h3>);
      continue;
    }
    if (line === '') continue;
    out.push(<p key={key++}>{renderInline(line)}</p>);
  }
  flushList();
  flushTable();
  return out;
}
