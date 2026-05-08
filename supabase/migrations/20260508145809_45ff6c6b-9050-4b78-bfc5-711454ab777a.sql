CREATE TABLE public.baby_memories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.baby_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read baby_memories" ON public.baby_memories FOR SELECT USING (true);
CREATE POLICY "Public insert baby_memories" ON public.baby_memories FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update baby_memories" ON public.baby_memories FOR UPDATE USING (true);
CREATE POLICY "Public delete baby_memories" ON public.baby_memories FOR DELETE USING (true);

CREATE TRIGGER baby_memories_updated_at
BEFORE UPDATE ON public.baby_memories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_baby_memories_created ON public.baby_memories(created_at DESC);