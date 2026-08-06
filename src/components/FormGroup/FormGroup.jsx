import styles from './FormGroup.module.css';

// Label-above-control field stack -- the .formGroup / label / select rules
// were byte-identical copies in StageConfigModal.module.css and
// ServiceConfigModal.module.css; this is that block, extracted once.
// (RallyBasicsForm has its own visually different treatment -- uppercase
// muted labels, structural :first-child selectors -- so it deliberately
// does NOT use this.)
//
// `label` is optional: some groups (radio sets, the Service summary) title
// themselves with a bare label and no target control, others pass htmlFor
// to bind to a specific input/select. Children render as-is; the module's
// `.formGroup select` descendant rule is what gives bare <select>s their
// shared look, so consumers don't need a Select primitive for that.
export function FormGroup({ label, htmlFor, children }) {
  return (
    <div className={styles.formGroup}>
      {label != null && <label htmlFor={htmlFor}>{label}</label>}
      {children}
    </div>
  );
}

// The right-aligned Cancel/Save row both config modals end their form with
// -- rule above, actions pushed to the trailing edge. Lives here rather
// than in Modal because it belongs to the *form*, not the dialog chrome
// (StageConfigModal keeps a second Save up in its sticky header).
export function FormActions({ children }) {
  return <div className={styles.actions}>{children}</div>;
}
