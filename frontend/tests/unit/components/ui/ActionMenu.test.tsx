import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { describe, it, expect, vi } from 'vitest'
import { Trash2, Settings } from 'lucide-react'

describe('ActionMenu', () => {
    it('renders and toggle menu', async () => {
        render(<ActionMenu onDelete={vi.fn()} />)
        
        const button = screen.getByRole('button')
        expect(button).toBeTruthy()
        
        // Menu should be closed initially
        expect(screen.queryByText(/Delete Project/i)).toBeNull()
        
        // Open menu
        fireEvent.click(button)
        expect(screen.getByText(/Delete Project/i)).toBeTruthy()
        
        // Close menu
        fireEvent.click(button)
        await waitFor(() => {
            expect(screen.queryByText(/Delete Project/i)).toBeNull()
        })
    })

    it('works with the new items prop', () => {
        const mockFn1 = vi.fn()
        const mockFn2 = vi.fn()
        
        const items = [
            { label: 'Edit Project', icon: Settings, onClick: mockFn1 },
            { label: 'Remove', icon: Trash2, onClick: mockFn2, isDestructive: true }
        ]
        
        render(<ActionMenu items={items} />)
        
        fireEvent.click(screen.getByRole('button'))
        
        expect(screen.getByText('Edit Project')).toBeTruthy()
        const removeBtn = screen.getByText('Remove')
        expect(removeBtn).toBeTruthy()
        
        // Clicks item and calls the function
        fireEvent.click(removeBtn)
        expect(mockFn2).toHaveBeenCalled()
    })

    it('maintains backward compatibility with onDelete', () => {
        const onDelete = vi.fn()
        render(<ActionMenu onDelete={onDelete} />)
        
        fireEvent.click(screen.getByRole('button'))
        const deleteBtn = screen.getByText(/Delete Project/i)
        
        fireEvent.click(deleteBtn)
        expect(onDelete).toHaveBeenCalled()
    })
})
