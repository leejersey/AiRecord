export type SceneType = 'meeting' | 'interview' | 'idea' | 'general';
export type RecordingStatus = 'uploaded' | 'transcribing' | 'transcribed' | 'analyzing' | 'done' | 'failed';

export interface Utterance {
  text: string;
  start_time: number;
  end_time: number;
}

export interface AnalysisResult {
  summary?: string;
  key_points?: string[];
  action_items?: ActionItem[];
  sentiment?: string;
  topics?: string[];
  follow_up_questions?: string[];
  [key: string]: any;
}

export interface ActionItem {
  task: string;
  assignee?: string;
  deadline?: string;
}

export interface Recording {
  id: string;
  title: string;
  audio_path: string;
  audio_format: string;
  duration: number;
  file_size: number;
  transcript?: string;
  utterances?: Utterance[];
  analysis?: AnalysisResult;
  scene_type: SceneType;
  status: RecordingStatus;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export type TodoStatus = 'pending' | 'done' | 'overdue';

export interface Todo {
  id: string;
  recording_id: string;
  task: string;
  assignee?: string;
  deadline?: string;
  status: TodoStatus;
  resolved_by?: string;
  source_scene?: string;
  created_at: string;
  updated_at: string;
}
