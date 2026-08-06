import { forwardRef } from 'react';
import styles from './Input.module.css';

// rbr-rally-creator-web#98: shared text-entry control with a focus "glow"
// (border-color shift + soft box-shadow bloom) so it's obvious where you're
// currently typing -- previously every component styled its own raw
// <input>/<textarea> with no focus feedback beyond the browser default.
// Thin wrapper: forwards every prop/ref straight through to the underlying
// element, only intercepting `size` and `className` to compose classes.
// `as="textarea"` renders a <textarea> instead of an <input> so callers
// don't need a separate component for the one multi-line field in the app
// (RallyBasicsForm's description) -- see the Textarea convenience export
// below for the common case.
export const Input = forwardRef(function Input({ as = 'input', size = 'md', className = '', ...props }, ref) {
  const Tag = as;
  const sizeClass = styles[size] ?? styles.md;
  const classes = [styles.input, sizeClass, className].filter(Boolean).join(' ');
  return <Tag ref={ref} className={classes} {...props} />;
});

export const Textarea = forwardRef(function Textarea(props, ref) {
  return <Input {...props} as="textarea" ref={ref} />;
});
