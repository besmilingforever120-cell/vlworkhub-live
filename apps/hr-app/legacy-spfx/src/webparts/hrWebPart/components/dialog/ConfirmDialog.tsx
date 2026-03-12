import * as React from 'react';
import styles from './ConfirmDialog.module.scss';
import { AlertTriangle, Trash2, Info, AlertCircle, X } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export type ConfirmDialogVariant = 'danger' | 'warning' | 'info';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmDialogVariant;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

// ============================================================================
// CONFIRM DIALOG COMPONENT
// ============================================================================

/**
 * Beautiful, reusable confirmation dialog
 * 
 * Usage:
 * ```tsx
 * const [showConfirm, setShowConfirm] = useState(false);
 * 
 * <ConfirmDialog
 *   isOpen={showConfirm}
 *   title="Delete Announcement?"
 *   message="Are you sure you want to delete this announcement? This action cannot be undone."
 *   variant="danger"
 *   confirmText="Delete"
 *   onConfirm={() => { ... }}
 *   onCancel={() => setShowConfirm(false)}
 * />
 * ```
 */
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
  isLoading = false,
}) => {
  // Don't render if not open
  if (!isOpen) return null;

  // Get appropriate icon based on variant
  const getIcon = () => {
    switch (variant) {
      case 'danger':
        return <Trash2 size={24} />;
      case 'warning':
        return <AlertTriangle size={24} />;
      case 'info':
        return <Info size={24} />;
      default:
        return <AlertCircle size={24} />;
    }
  };

  // Prevent closing while loading
  const handleCancel = () => {
    if (!isLoading) {
      onCancel();
    }
  };

  const handleConfirm = () => {
    if (!isLoading) {
      onConfirm();
    }
  };

  // Close on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onCancel();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, isLoading, onCancel]);

  return (
    <div className={styles.overlay} onClick={handleCancel}>
      <div 
        className={`${styles.dialog} ${styles[variant]}`} 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div className={styles.iconContainer}>
          {getIcon()}
        </div>

        {/* Close Button */}
        <button 
          className={styles.closeBtn} 
          onClick={handleCancel}
          disabled={isLoading}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>

        {/* Content */}
        <div className={styles.content}>
          <h3 className={styles.title}>{title}</h3>
          <p className={styles.message}>{message}</p>
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          <button
            className={styles.cancelBtn}
            onClick={handleCancel}
            disabled={isLoading}
          >
            {cancelText}
          </button>
          <button
            className={`${styles.confirmBtn} ${styles[variant]}`}
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className={styles.spinner} />
                Processing...
              </>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;