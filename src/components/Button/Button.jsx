import { forwardRef } from 'react';
import styles from './Button.module.css';

// Shared push-button, extracted from the near-identical per-component
// copies that had accumulated (CredentialForm's .submit, both config
// modals' .saveButton/.cancelButton, StageConfigModal's .headerSaveButton
// and inline notice buttons, RallyBuilder's .submitButton). Same
// thin-wrapper contract as Input: every prop (type, disabled, onClick,
// form, aria-*, children...) forwards straight to the underlying <button>;
// only `variant`/`size`/`className` are intercepted to compose classes.
//
// Ownership split: the variant owns the *look* (colors, border, weight,
// hover/disabled treatment), the consumer owns *placement* (margins, flex
// behavior) via className.
//
// `size` is deliberately optional. The two config modals' actions rows
// share "md" and their small inline notice buttons share "sm", but several
// one-off buttons keep their own historical metrics -- when `size` is
// omitted, Button sets NO padding/font-size at all, so a consumer class
// can supply its own without an import-order/specificity fight between CSS
// modules (the same hazard StageConfigModal's .pickerFilterInput comment
// works around with a two-class selector).
//
// No default `type` either: a plain <button> defaults to type="submit",
// and consumers were written against that native default -- injecting
// type="button" here would silently change form-submit behavior.
export const Button = forwardRef(function Button(
  { variant = 'primary', size, className = '', ...props },
  ref
) {
  const classes = [styles.button, styles[variant], size ? styles[size] : '', className]
    .filter(Boolean)
    .join(' ');
  return <button ref={ref} className={classes} {...props} />;
});
