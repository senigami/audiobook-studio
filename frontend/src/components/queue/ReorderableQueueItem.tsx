import React from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { Trash2, GripVertical, Clock } from 'lucide-react';
import type { ProcessingQueueItem } from '../../types';
import { formatQueueContext } from '../../utils/queueLabels';

interface ReorderableQueueItemProps {
    job: ProcessingQueueItem;
    formatJobTitle: (job: any) => string;
    handleRemove: (id: string) => void;
    handleDragStart: () => void;
    handleDragEnd: () => void;
}

export const ReorderableQueueItem: React.FC<ReorderableQueueItemProps> = React.memo(({
    job,
    formatJobTitle,
    handleRemove,
    handleDragStart,
    handleDragEnd
}) => {
    const dragControls = useDragControls();
    const [isHovered, setIsHovered] = React.useState(false);
    const [isDragging, setIsDragging] = React.useState(false);

    const onStart = () => {
        setIsDragging(true);
        handleDragStart();
    };

    const onEnd = () => {
        setIsDragging(false);
        setIsHovered(false);
        handleDragEnd();
    };

    return (
        <Reorder.Item 
            value={job}
            dragListener={false}
            dragControls={dragControls}
            onMouseEnter={() => !isDragging && setIsHovered(true)}
            onMouseLeave={() => !isDragging && setIsHovered(false)}
            onPointerUp={onEnd} // Final safety fallback
            animate={{
                scale: isDragging ? 1.01 : 1,
                boxShadow: isDragging ? 'var(--shadow-lg)' : (isHovered ? 'var(--shadow-md)' : 'none'),
                zIndex: isDragging ? 100 : (isHovered ? 10 : 1),
            }}
            transition={{ duration: isDragging ? 0 : 0.2 }}
            style={{
                background: 'var(--surface)', 
                borderRadius: '12px', 
                padding: '1rem 1.25rem', 
                border: '1px solid var(--border)', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '1.25rem', 
                cursor: 'default',
                position: 'relative',
                userSelect: 'none'
            }}
            onDragStart={onStart}
            onDragEnd={onEnd}
        >
            <div 
                onPointerDown={(e) => dragControls.start(e)}
                style={{ 
                    color: 'var(--text-muted)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    cursor: isDragging ? 'grabbing' : 'grab',
                    padding: '4px'
                }} 
                title="Drag to reorder"
            >
                <GripVertical size={18} strokeWidth={2} style={{ pointerEvents: 'none' }} />
            </div>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'var(--surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                <Clock size={18} strokeWidth={2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <h4 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatJobTitle(job)}</h4>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{formatQueueContext(job)}</div>
            </div>
            <button 
                onClick={(e) => { e.stopPropagation(); handleRemove(job.id); }} 
                className="hover-bg-destructive" 
                style={{ 
                    background: 'none', 
                    border: 'none', 
                    padding: '8px', 
                    borderRadius: '8px', 
                    cursor: 'pointer', 
                    color: isHovered ? 'var(--error)' : 'var(--text-muted)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    transition: 'all 0.2s ease',
                    opacity: isHovered ? 1 : 0.6
                }}
            >
                <Trash2 size={16} strokeWidth={2} />
            </button>
        </Reorder.Item>
    );
});
