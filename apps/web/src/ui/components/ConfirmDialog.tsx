import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './Button.tsx';
import type { IconName } from './Icon.tsx';
import './ConfirmDialog.css';

/**
 * 保存内容や取り消せない操作（削除など）の確認。ブラウザ標準の <dialog> をモーダルで開き、フォーカスの閉じ込めと Esc での取り消しを任せる。
 * 開いたときは取り消し側にフォーカスを置き（うっかり確定しないため）、閉じたら開く前の場所へ戻す。
 * 実行中（busy）は閉じられないようにし、二重に押せないようにする。
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  confirmIcon,
  confirmVariant = 'danger',
  cancelLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  confirmIcon?: IconName;
  confirmVariant?: 'primary' | 'danger';
  cancelLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      cancelRef.current?.focus();
    }
    if (!open && dialog.open) {
      dialog.close();
      returnTo.current?.focus();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="fr-dialog"
      role="alertdialog"
      aria-labelledby="fr-dialog-title"
      aria-describedby="fr-dialog-body"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 className="fr-dialog__title" id="fr-dialog-title">
        {title}
      </h2>
      <div className="fr-dialog__body" id="fr-dialog-body">
        {children}
      </div>
      <div className="fr-dialog__actions">
        <Button variant={confirmVariant} block busy={busy} {...(confirmIcon ? { icon: confirmIcon } : {})} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button ref={cancelRef} variant="secondary" block disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </dialog>
  );
}
