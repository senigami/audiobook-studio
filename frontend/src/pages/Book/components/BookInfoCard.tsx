import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { InlineEdit } from '@/components/forms/InlineEdit';
import { ContinueListeningCard } from '@/pages/Book/components/ContinueListeningCard';
import { useDragDropHighlight } from '@/hooks/useDragDropHighlight';
import { CoverImageModal } from '@/pages/ProjectDetail/components/ProjectModals';
import { formatLength } from '@/utils/format';
import type { Audiobook, Project } from '@/types';

interface BookInfoCardProps {
  project: Project;
  totalRuntime: number;
  totalPredicted: number | null;
  hasRendered: boolean;
  hasUnrendered: boolean;
  audiobooks?: Audiobook[];
  onUpdateProject: (data: { name: string; series: string; series_position?: number | null; author: string; description?: string; cover?: File | null }) => Promise<boolean>;
}

export function BookInfoCard({
  project,
  totalRuntime,
  totalPredicted,
  hasRendered,
  hasUnrendered,
  audiobooks = [],
  onUpdateProject,
}: BookInfoCardProps) {
  const [showCover, setShowCover] = useState(false);
  const [isSeriesNumberEditing, setIsSeriesNumberEditing] = useState(false);
  const [seriesPositionDraft, setSeriesPositionDraft] = useState(project.series_position?.toString() || '');
  const coverInputRef = useRef<HTMLInputElement>(null);
  const hasSeriesPosition = project.series_position !== null && project.series_position !== undefined;

  useEffect(() => {
    setSeriesPositionDraft(project.series_position?.toString() || '');
  }, [project.series_position]);

  const updateField = (field: 'name' | 'series' | 'author', value: string) => {
    void onUpdateProject({
      name: field === 'name' ? value : project.name,
      series: field === 'series' ? value : project.series || '',
      author: field === 'author' ? value : project.author || '',
      series_position: project.series_position,
    });
  };

  const updateDescription = (value: string) => {
    void onUpdateProject({
      name: project.name,
      series: project.series || '',
      author: project.author || '',
      series_position: project.series_position,
      description: value.trim(),
    });
  };

  const handleCoverChange = (file: File | undefined) => {
    if (!file) return;
    void onUpdateProject({
      name: project.name,
      series: project.series || '',
      author: project.author || '',
      cover: file,
    });
    if (coverInputRef.current) {
      coverInputRef.current.value = '';
    }
  };

  const handleSeriesPositionChange = (delta: 1 | -1) => {
    const next = (project.series_position ?? 0) + delta;
    const nextValue = next > 0 ? next : null;
    void onUpdateProject({
      name: project.name,
      series: project.series || '',
      author: project.author || '',
      series_position: nextValue,
    });
    setSeriesPositionDraft(nextValue ? String(nextValue) : '');
  };

  const parseSeriesPositionDraft = () => {
    if (seriesPositionDraft.trim() === '') {
      return null;
    }

    const parsed = Number(seriesPositionDraft);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setSeriesPositionDraft(project.series_position?.toString() || '');
      return project.series_position ?? null;
    }

    return parsed;
  };

  const commitSeriesPositionDraft = () => {
    const nextPosition = parseSeriesPositionDraft();
    void onUpdateProject({
      name: project.name,
      series: project.series || '',
      author: project.author || '',
      series_position: nextPosition,
    });
    setIsSeriesNumberEditing(false);
  };

  const handleSeriesPositionKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      commitSeriesPositionDraft();
    }
    if (event.key === 'Escape') {
      setSeriesPositionDraft(project.series_position?.toString() || '');
      setIsSeriesNumberEditing(false);
    }
  };

  const handleSeriesEditorBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    if (isSeriesNumberEditing) {
      commitSeriesPositionDraft();
    }
  };

  const { isDragging, dragDropProps } = useDragDropHighlight((files) => handleCoverChange(files[0]));
  const metadataPills = [
    hasRendered ? { label: `Runtime ${formatLength(totalRuntime)}`, tone: 'success' as const } : null,
    hasUnrendered && totalPredicted !== null
      ? { label: `Predicted ${formatLength(totalPredicted)}`, tone: 'info' as const }
      : null,
    !hasRendered && hasUnrendered
      ? { label: 'No segments yet', tone: 'muted' as const }
      : null,
    hasRendered && !hasUnrendered
      ? { label: 'Rendered', tone: 'success' as const }
      : null,
    { label: `Created ${new Date(project.created_at * 1000).toLocaleDateString()}`, tone: 'muted' as const },
  ].filter(Boolean) as Array<{ label: string; tone: 'success' | 'info' | 'muted' }>;
  const titleTypography = {
    fontSize: 'var(--book-info-title-size)',
    lineHeight: 1.04,
    fontWeight: 800,
  };
  const inlineTextInputStyle = {
    padding: 0,
    border: 'none',
    borderStyle: 'none',
    borderWidth: 0,
    borderRadius: 0,
    background: 'transparent',
  };
  const metadataInlineTextInputStyle = {
    ...inlineTextInputStyle,
    width: 'auto',
    minWidth: '0',
  };
  const authorTypography = {
    fontSize: '1.02rem',
    fontStyle: 'normal',
    fontWeight: 600,
    lineHeight: 1.35,
  };
  const emptyAuthorTypography = {
    fontSize: '1.02rem',
    fontStyle: 'italic',
    fontWeight: 500,
    lineHeight: 1.35,
  };
  const seriesTypography = {
    fontSize: '0.88rem',
    fontStyle: 'normal',
    fontWeight: 650,
    lineHeight: 1.04,
  };
  const getInlineInputSize = (value: string, minimum = 8) => Math.min(Math.max(value.length || minimum, minimum), 28);

  return (
    <section className="book-info-card" aria-label="Book info">
      <div className="book-info-card__cover">
        <button
          type="button"
          className={`book-info-card__cover-button${isDragging ? ' book-info-card__cover-button--dragging' : ''}`}
          onClick={() => project.cover_image_path && setShowCover(true)}
          aria-label="View cover"
          disabled={!project.cover_image_path}
          {...dragDropProps}
        >
          {project.cover_image_path && (
            <img
              className="book-info-card__cover-blur"
              src={project.cover_image_path}
              alt=""
              aria-hidden="true"
            />
          )}
          {project.cover_image_path ? (
            <div className="book-info-card__cover-foreground-shell" aria-hidden="true">
              <img
                className="book-info-card__cover-foreground"
                src={project.cover_image_path}
                alt="Book cover"
                style={{ opacity: isDragging ? 0.35 : 1 }}
              />
            </div>
          ) : (
            <div className="book-info-card__cover-placeholder">
              <ImageIcon size={32} aria-hidden="true" />
              <span>{isDragging ? 'Drop cover image' : 'New cover'}</span>
            </div>
          )}
          {isDragging && <span className="book-info-card__cover-drop-overlay" aria-hidden="true" />}
        </button>
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Change cover file"
          onChange={(event) => handleCoverChange(event.target.files?.[0])}
        />
        <button type="button" className="btn-ghost" onClick={() => coverInputRef.current?.click()}>
          Change cover
        </button>
      </div>

      <div className="book-info-card__content">
        <div className="book-info-card__title-block">
          <InlineEdit
            value={project.name}
            onSave={(value) => updateField('name', value)}
            className="book-info-card__title"
            style={{
              padding: 0,
              borderRadius: 0,
              background: 'transparent',
              minHeight: 'auto',
              alignItems: 'flex-start',
              ...titleTypography,
            }}
            inputStyle={{
              ...inlineTextInputStyle,
              ...titleTypography,
            }}
            inputAriaLabel="Title"
          />
          {project.author ? (
            <div className="book-info-card__byline">
              <span className="book-info-card__byline-prefix">by</span>
              <InlineEdit
                value={project.author || ''}
                onSave={(value) => updateField('author', value.trim())}
                className="book-info-card__metadata-read book-info-card__metadata-read--author"
                style={{
                  padding: 0,
                  borderRadius: 0,
                  background: 'transparent',
                  minHeight: 'auto',
                }}
                inputStyle={{ ...metadataInlineTextInputStyle, ...authorTypography }}
                inputAriaLabel="Author"
                inputSize={getInlineInputSize(project.author || 'Author', 10)}
              />
            </div>
          ) : (
            <InlineEdit
              value=""
              placeholder="Add author"
              onSave={(value) => updateField('author', value.trim())}
              className="book-info-card__byline book-info-card__metadata-read book-info-card__metadata-read--empty"
              style={{
                padding: 0,
                borderRadius: 0,
                background: 'transparent',
                minHeight: 'auto',
                color: 'var(--text-muted)',
                fontStyle: 'italic',
              }}
              inputStyle={{ ...metadataInlineTextInputStyle, ...emptyAuthorTypography }}
              inputAriaLabel="Author"
              inputSize={10}
            />
          )}
          <div className="book-info-card__series-line" onBlur={handleSeriesEditorBlur}>
            <InlineEdit
              value={project.series || ''}
              placeholder="Add series"
              onSave={(value) => updateField('series', value.trim())}
              className={`book-info-card__metadata-read book-info-card__metadata-read--series ${project.series ? '' : 'book-info-card__metadata-read--empty'}`}
              style={{
                padding: 0,
                borderRadius: 0,
                background: 'transparent',
                minHeight: 'auto',
                ...(project.series ? undefined : { color: 'var(--text-muted)', fontStyle: 'italic' }),
              }}
              inputStyle={{ ...metadataInlineTextInputStyle, ...seriesTypography }}
              inputAriaLabel="Series name"
              inputSize={getInlineInputSize(project.series || 'Series', 8)}
            />
            {hasSeriesPosition || isSeriesNumberEditing ? (
              <>
                <span className="book-info-card__series-book-label">Book</span>
                <span className="book-info-card__series-position" aria-label="Series position controls">
                  <button
                    type="button"
                    className="book-info-card__stepper"
                    onClick={() => {
                      setIsSeriesNumberEditing(true);
                      handleSeriesPositionChange(-1);
                    }}
                    aria-label="Decrease series position"
                    disabled={!hasSeriesPosition}
                  >
                    <span aria-hidden="true">-</span>
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="book-info-card__series-position-input"
                    value={seriesPositionDraft}
                    onChange={(event) => {
                      setIsSeriesNumberEditing(true);
                      setSeriesPositionDraft(event.target.value);
                    }}
                    onFocus={() => setIsSeriesNumberEditing(true)}
                    onKeyDown={handleSeriesPositionKeyDown}
                    aria-label="Series position"
                    placeholder="No number"
                  />
                  <button
                    type="button"
                    className="book-info-card__stepper"
                    onClick={() => {
                      setIsSeriesNumberEditing(true);
                      handleSeriesPositionChange(1);
                    }}
                    aria-label="Increase series position"
                  >
                    <span aria-hidden="true">+</span>
                  </button>
                </span>
              </>
            ) : (
              <button
                type="button"
                className="book-info-card__series-number-add"
                onClick={() => setIsSeriesNumberEditing(true)}
                aria-label="Add series number"
              >
                Add book number
              </button>
            )}
          </div>
        </div>

        <InlineEdit
          value={project.description || ''}
          placeholder="Add a description to give readers and listeners a sense of the story before they dive in."
          className="book-info-card__description"
          multiline
          onSave={updateDescription}
          inputAriaLabel="Book description"
        />

        <ContinueListeningCard audiobooks={audiobooks} coverImagePath={project.cover_image_path} />

        <div className="book-info-card__chips" aria-label="Book metadata">
          {metadataPills.map((pill) => (
            <span
              key={pill.label}
              className={`book-info-card__chip book-info-card__chip--${pill.tone}`}
            >
              {pill.label}
            </span>
          ))}
        </div>
      </div>

      <CoverImageModal
        isOpen={showCover}
        onClose={() => setShowCover(false)}
        imagePath={project.cover_image_path || ''}
      />
    </section>
  );
}
