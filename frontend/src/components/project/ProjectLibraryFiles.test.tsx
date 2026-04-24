import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChapterList } from './ChapterList';
import { ProjectCard } from './ProjectCard';
import { ProjectHeader } from './ProjectHeader';

describe('Project Library Components', () => {
    const mockChapters = [
        { id: 'chap-1', title: 'Chapter 1', audio_status: 'done', char_count: 1000 },
        { id: 'chap-2', title: 'Chapter 2', audio_status: 'unprocessed', char_count: 500 }
    ];

    const mockProject = {
        id: 'proj-1',
        name: 'Test Project',
        created_at: Date.now(),
        updated_at: Date.now(),
        chapter_count: 2
    };

    describe('ChapterList', () => {
        it('renders list of chapters', () => {
            render(
                <ChapterList 
                    chapters={mockChapters as any}
                    projectId="proj-1"
                    jobs={{}}
                    isAssemblyMode={false}
                    selectedChapters={new Set()}
                    onSelectChapter={vi.fn()}
                    onSelectAll={vi.fn()}
                    onReorder={vi.fn()}
                    onEditChapter={vi.fn()}
                    onRenameChapter={vi.fn() as any}
                    onQueueChapter={vi.fn()}
                    onResetAudio={vi.fn()}
                    onDeleteChapter={vi.fn()}
                    onExportSample={vi.fn()}
                    isExporting={null}
                    formatLength={(s) => `${s}s`}
                />
            );

            expect(screen.getByText('Chapter 1')).toBeInTheDocument();
            expect(screen.getByText('Chapter 2')).toBeInTheDocument();
        });
    });

    describe('ProjectCard', () => {
        it('renders project details', () => {
            const fullProject = {
                ...mockProject,
                series: 'Test Series',
                author: 'Test Author',
                cover_image_path: ''
            };
            render(
                <ProjectCard 
                    project={fullProject as any}
                    isHovered={false}
                    onHover={vi.fn()}
                    onClick={vi.fn()}
                    onDelete={vi.fn()}
                    formatDate={(ts) => `date ${ts}`}
                />
            );

            expect(screen.getByText('Test Project')).toBeInTheDocument();
        });
    });

    describe('ProjectHeader', () => {
        it('renders project name', () => {
            const fullProject = {
                ...mockProject,
                series: 'Test Series',
                author: 'Test Author',
                cover_image_path: ''
            };
            render(
                <ProjectHeader 
                    project={fullProject as any}
                    totalRuntime={0}
                    totalPredicted={0}
                    onEditMetadata={vi.fn()}
                    onShowCover={vi.fn()}
                    formatLength={(s: number) => `${s}s`}
                />
            );

            expect(screen.getByText('Test Project')).toBeInTheDocument();
        });
    });
});
