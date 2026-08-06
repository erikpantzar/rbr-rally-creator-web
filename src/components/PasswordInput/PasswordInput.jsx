import { useState } from 'react';
import { Input } from '../Input/Input.jsx';
import styles from './PasswordInput.module.css';

// Password field with a show/hide toggle -- extracted from the
// verbatim-duplicated passwordRow blocks in CredentialForm and
// RallyBasicsForm. Visibility state lives in here rather than in the
// forms: it's purely presentational ("is the value readable right now"),
// nothing upstream ever needed to know it.
//
// Same thin-wrapper contract as Input: everything except `className`
// (composed onto the row) forwards straight to the underlying Input --
// id, value, onChange, placeholder, autoComplete, disabled, size, etc.
// `type` is the one prop this component owns, driven by the toggle.
//
// The toggle button reads the same `disabled` as the input (CredentialForm
// disables the whole row while submitting) -- when the caller passes no
// disabled, both stay enabled, exactly like the pre-extraction copies.
export function PasswordInput({ className = '', ...inputProps }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={[styles.passwordRow, className].filter(Boolean).join(' ')}>
      <Input {...inputProps} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        className={styles.toggleVisibility}
        onClick={() => setVisible((v) => !v)}
        disabled={inputProps.disabled}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
      >
        {visible ? '🙈' : '👁'}
      </button>
    </div>
  );
}
