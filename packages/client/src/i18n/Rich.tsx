import { Fragment } from 'react';

/** Rend `**texte**` en gras : les phrases traduites gardent leur emphase sans HTML. */
export function Rich({ text }: { text: string }) {
  const parts = text.split('**');
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <strong key={i}>{p}</strong> : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}
