import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { Search, X, ChevronDown, ChevronUp, User, Check, Loader } from 'lucide-react';
import styles from './MultiSelectUsers.module.scss';

interface UserOption {
  Id: number;
  Title: string;
}

interface MultiSelectUsersProps {
  options: UserOption[];
  selectedIds: number[];
  onChange: (selectedIds: number[]) => void;
  placeholder?: string;
  disabled?: boolean;
  maxSelections?: number;
  batchSize?: number; // Number of users to load per batch
}

export const MultiSelectUsers: React.FC<MultiSelectUsersProps> = ({
  options,
  selectedIds = [],
  onChange,
  placeholder = 'Select users...',
  disabled = false,
  maxSelections,
  batchSize = 50 // Default: load 50 users at a time
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [displayCount, setDisplayCount] = useState(batchSize);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Ensure selectedIds is always an array
  const safeSelectedIds = Array.isArray(selectedIds) ? selectedIds : [];

  // Reset display count when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setDisplayCount(batchSize);
    }
  }, [isOpen, batchSize]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter options based on search query
  const filteredOptions = options.filter(option =>
    option.Title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get options to display (with lazy loading)
  const displayedOptions = filteredOptions.slice(0, displayCount);
  const hasMore = displayCount < filteredOptions.length;

  // Get selected users
  const selectedUsers = options.filter(option => safeSelectedIds.includes(option.Id));

  // Handle scroll to load more
  const handleScroll = (e: React.UIEvent<HTMLDivElement>): void => {
    const target = e.currentTarget;
    const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

    // Load more when scrolled to within 100px of bottom
    if (scrollBottom < 100 && hasMore && !isLoadingMore) {
      setIsLoadingMore(true);
      
      // Simulate loading delay (you can remove this if not needed)
      setTimeout(() => {
        setDisplayCount(prev => Math.min(prev + batchSize, filteredOptions.length));
        setIsLoadingMore(false);
      }, 300);
    }
  };

  // Reset display count when search changes
  useEffect(() => {
    setDisplayCount(batchSize);
  }, [searchQuery, batchSize]);

  // Toggle user selection
  const toggleUser = (userId: number): void => {
    let newSelectedIds: number[];
    
    if (safeSelectedIds.includes(userId)) {
      // Remove user
      newSelectedIds = safeSelectedIds.filter(id => id !== userId);
    } else {
      // Add user (check max selections)
      if (maxSelections && safeSelectedIds.length >= maxSelections) {
        return; // Don't add if max reached
      }
      newSelectedIds = [...safeSelectedIds, userId];
    }
    
    onChange(newSelectedIds);
  };

  // Remove specific user
  const removeUser = (userId: number, e: React.MouseEvent): void => {
    e.stopPropagation();
    const newSelectedIds = safeSelectedIds.filter(id => id !== userId);
    onChange(newSelectedIds);
  };

  // Select all filtered users
  const selectAll = (): void => {
    const filteredIds = filteredOptions.map(opt => opt.Id);
    const newSelectedIds = [...new Set([...safeSelectedIds, ...filteredIds])];
    
    if (maxSelections) {
      onChange(newSelectedIds.slice(0, maxSelections));
    } else {
      onChange(newSelectedIds);
    }
  };

  // Clear all selections
  const clearAll = (): void => {
    onChange([]);
  };

  return (
    <div className={styles.multiSelectContainer} ref={dropdownRef}>
      <div
        className={`${styles.multiSelectTrigger} ${isOpen ? styles.open : ''} ${
          disabled ? styles.disabled : ''
        }`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <div className={styles.selectedChips}>
          {selectedUsers.length === 0 ? (
            <span className={styles.placeholder}>{placeholder}</span>
          ) : (
            selectedUsers.map(user => (
              <div key={user.Id} className={styles.chip}>
                <User size={12} />
                <span>{user.Title}</span>
                <button
                  className={styles.chipRemove}
                  onClick={e => removeUser(user.Id, e)}
                  disabled={disabled}
                  type="button"
                  aria-label={`Remove ${user.Title}`}
                >
                  <X size={12} />
                </button>
              </div>
            ))
          )}
        </div>
        <div className={styles.triggerIcon}>
          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {isOpen && !disabled && (
        <div className={styles.dropdownPanel} onClick={(e) => e.stopPropagation()}>
          {/* Search Bar */}
          <div className={styles.searchBar}>
            <Search size={14} />
            <input
              type="text"
              placeholder="Search users..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={styles.searchInput}
              onClick={e => e.stopPropagation()}
            />
            {searchQuery && (
              <button
                className={styles.clearSearch}
                onClick={e => {
                  e.stopPropagation();
                  setSearchQuery('');
                }}
                type="button"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Actions */}
          <div className={styles.actions}>
            <button
              className={styles.actionBtn}
              onClick={e => {
                e.stopPropagation();
                selectAll();
              }}
              disabled={filteredOptions.length === 0}
              type="button"
            >
              Select All {filteredOptions.length > 0 && `(${filteredOptions.length})`}
            </button>
            <button
              className={styles.actionBtn}
              onClick={e => {
                e.stopPropagation();
                clearAll();
              }}
              disabled={safeSelectedIds.length === 0}
              type="button"
            >
              Clear All
            </button>
          </div>

          {/* User List with Lazy Loading */}
          <div 
            className={styles.optionsList} 
            ref={scrollRef}
            onScroll={handleScroll}
          >
            {filteredOptions.length === 0 ? (
              <div className={styles.noResults}>
                <User size={24} />
                <p>No users found</p>
              </div>
            ) : (
              <>
                {displayedOptions.map(option => {
                  const isSelected = safeSelectedIds.includes(option.Id);
                  const isDisabled =
                    maxSelections && !isSelected && safeSelectedIds.length >= maxSelections;

                  return (
                    <div
                      key={option.Id}
                      className={`${styles.optionItem} ${isSelected ? styles.selected : ''} ${
                        isDisabled ? styles.disabled : ''
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isDisabled) {
                          toggleUser(option.Id);
                        }
                      }}
                    >
                      <div className={styles.checkbox}>
                        {isSelected && <Check size={14} />}
                      </div>
                      <User size={14} className={styles.userIcon} />
                      <span className={styles.optionLabel}>{option.Title}</span>
                    </div>
                  );
                })}

                {/* Loading indicator */}
                {isLoadingMore && (
                  <div className={styles.loadingMore}>
                    <Loader size={16} className={styles.spinner} />
                    <span>Loading more users...</span>
                  </div>
                )}

                {/* Show "scroll for more" hint */}
                {hasMore && !isLoadingMore && (
                  <div className={styles.scrollHint}>
                    <span>Scroll down to load more ({filteredOptions.length - displayCount} remaining)</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className={styles.footer}>
            <span className={styles.footerText}>
              {safeSelectedIds.length} selected
              {maxSelections && ` of ${maxSelections} max`}
              {filteredOptions.length > displayCount && 
                ` • Showing ${displayCount} of ${filteredOptions.length}`
              }
            </span>
          </div>
        </div>
      )}
    </div>
  );
};