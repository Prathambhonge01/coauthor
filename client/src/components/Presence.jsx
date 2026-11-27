import { useEffect, useState } from 'react';
import { initials } from '../api.js';

/** Avatars of everyone currently in the document, read from Yjs awareness. */
export default function Presence({ provider, selfId }) {
  const [people, setPeople] = useState([]);

  useEffect(() => {
    const awareness = provider.awareness;
    const update = () => {
      const byUser = new Map();
      awareness.getStates().forEach((s) => s.user && byUser.set(s.user.id || s.user.name, s.user));
      setPeople([...byUser.values()]);
    };
    update();
    awareness.on('change', update);
    return () => awareness.off('change', update);
  }, [provider]);

  return (
    <ul className="presence" aria-label="People in this document">
      {people.map((p) => (
        <li key={p.id || p.name} className="avatar" style={{ background: p.color }} title={p.id === selfId ? `${p.name} (you)` : p.name}>
          {initials(p.name)}
        </li>
      ))}
    </ul>
  );
}
