import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProjectView } from './ProjectView';

export const stripMotionProps = (props: Record<string, unknown>) => {
  const {
    initial, animate, exit, transition, whileHover, whileTap, whileDrag,
    layout, layoutId, drag, dragListener, dragConstraints, dragElastic, onReorder,
    ...domProps
  } = props;
  return domProps;
};

export const mockProject = {
  id: 'proj-123',
  name: 'Test Project',
  series: 'Test Series',
  author: 'Test Author',
  speaker_profile_name: null,
  cover_image_path: '',
  created_at: 1000,
  updated_at: 2000,
};

export const mockChapters = [
  { 
    id: 'chap-1', 
    title: 'Chapter 1', 
    audio_status: 'done', 
    char_count: 100,
    total_segments_count: 10,
    done_segments_count: 10,
    has_wav: true,
    predicted_audio_length: 60
  },
  { 
    id: 'chap-2', 
    title: 'Chapter 2', 
    audio_status: 'unprocessed', 
    char_count: 200,
    total_segments_count: 0,
    done_segments_count: 0,
    has_wav: false,
    predicted_audio_length: 120
  },
];

export const mockSpeakerProfiles = [
  {
    name: 'Voice 1',
    wav_count: 1,
    speed: 1,
    is_default: true,
    speaker_id: 'speaker-1',
    variant_name: 'Default',
    preview_url: '/out/voices/Voice 1/sample.wav',
  },
];

export const mockSpeakerProfilesWithVariant = [
  {
    name: 'Voice 1 - Angry',
    wav_count: 1,
    speed: 1.5,
    is_default: false,
    speaker_id: 'speaker-1',
    variant_name: 'Angry',
    preview_url: '/out/voices/Voice 1 - Angry/sample.wav',
  },
  {
    name: 'Voice 1',
    wav_count: 1,
    speed: 1,
    is_default: false,
    speaker_id: 'speaker-1',
    variant_name: 'Default',
    preview_url: '/out/voices/Voice 1/sample.wav',
  },
];

export const mockSpeakers = [
  {
    id: 'speaker-1',
    name: 'Voice 1',
    default_profile_name: 'Voice 1',
    created_at: 1,
    updated_at: 1,
  },
];

export const renderProjectView = (props: any = {}) => {
  return render(
    <MemoryRouter initialEntries={['/project/proj-123']}>
      <Routes>
        <Route path="/project/:projectId" element={
          <ProjectView 
            jobs={{}} 
            speakerProfiles={mockSpeakerProfiles as any} 
            speakers={mockSpeakers as any} 
            {...props}
          />
        } />
      </Routes>
    </MemoryRouter>
  );
};
