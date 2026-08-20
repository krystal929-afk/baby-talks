import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil, Plus, Trash2, X, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { BUILT_IN_SKILLS } from "@/lib/baby-skills";
import {
  createSkill,
  deleteSkill,
  listSkills,
  updateSkill,
  type BabySkill,
} from "@/server/skills.functions";

export function BabySkillsPane() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");

  const { data: skills = [], isLoading } = useQuery({
    queryKey: ["baby_skills"],
    queryFn: () => listSkills(),
  });

  const add = useMutation({
    mutationFn: () =>
      createSkill({
        data: {
          name: name.trim(),
          description: description.trim(),
          instructions: instructions.trim(),
        },
      }),
    onSuccess: () => {
      setName("");
      setDescription("");
      setInstructions("");
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["baby_skills"] });
      toast.success("Baby learned a new skill.");
    },
    onError: (e: Error) => toast.error(e.message || "Baby couldn't learn that skill."),
  });

  const update = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: {
        name?: string;
        description?: string;
        instructions?: string;
        enabled?: boolean;
      };
    }) => updateSkill({ data: { id, ...patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["baby_skills"] }),
    onError: (e: Error) => toast.error(e.message || "Baby couldn't update that skill."),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteSkill({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["baby_skills"] });
      toast.success("Skill deleted.");
    },
    onError: (e: Error) => toast.error(e.message || "Baby couldn't delete that skill."),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Give the skill a name first.");
    if (!instructions.trim()) return toast.error("Tell Baby what the skill should do.");
    if (!add.isPending) add.mutate();
  };

  return (
    <div className="bf-skills h-full space-y-5 overflow-y-auto">
      <section>
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <div className="bf-section-label !mb-1 !mt-0">Active skills</div>
            <p className="text-[10px] leading-relaxed text-[#7f7770]">Things Baby can already do on command.</p>
          </div>
          <span className="text-[9px] uppercase tracking-[.15em] text-[#baff21]">wired in</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {BUILT_IN_SKILLS.map((skill, index) => (
            <div key={skill.id} className="bf-skill-card min-h-28 border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex h-8 w-8 items-center justify-center border border-[#6f20b6]/45 bg-[#6f20b6]/10 text-[#baff21]">
                  <Zap className="size-4" />
                </div>
                <span className="text-[8px] uppercase tracking-[.14em] text-[#baff21]">active</span>
              </div>
              <p className="text-xs font-semibold leading-tight text-[#e0d6c3]">{skill.name}</p>
              <p className="mt-1 text-[9px] leading-relaxed text-[#8f8880]">{skill.description}</p>
              <div className="mt-2 h-px bg-gradient-to-r from-[#6f20b6]/70 to-transparent" />
              <p className="mt-1 text-[8px] uppercase tracking-wider text-[#5f5853]">core {String(index + 1).padStart(2, "0")}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="bf-section-label !mb-1 !mt-0">Custom skills</div>
            <p className="text-[10px] leading-relaxed text-[#7f7770]">Repeatable workflows taught your way.</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setCreating((value) => !value)}
            className="bf-btn bf-btn-dark shrink-0 gap-1"
          >
            {creating ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
            {creating ? "Cancel" : "New"}
          </Button>
        </div>

        {creating && (
          <form onSubmit={submit} className="mb-3 space-y-3 border border-[#6f20b6]/45 bg-[#0b0810] p-3">
            <div className="bf-paper-title !mx-0 text-xs">NEW SKILL</div>
            <Field label="Skill name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Gig Prep" maxLength={80} autoFocus />
            </Field>
            <Field label="When should Baby use it?">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="When I ask Baby to prep for a DJ gig." maxLength={240} />
            </Field>
            <Field label="What should Baby do?">
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Check the calendar, summarize details, then build a short prep checklist..."
                rows={5}
                maxLength={4000}
                className="resize-none"
              />
            </Field>
            <Button type="submit" size="sm" className="bf-btn bf-btn-primary w-full gap-2" disabled={add.isPending || !name.trim() || !instructions.trim()}>
              {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Teach Baby this skill
            </Button>
          </form>
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-[#8f8880]"><Loader2 className="size-4 animate-spin" />Loading skills…</div>
        )}

        {!isLoading && skills.length === 0 && !creating && (
          <div className="bf-card border-dashed p-4 text-sm text-[#8f8880]">
            No custom skills yet. When you teach Baby one, it will live here.
          </div>
        )}

        <div className="space-y-2">
          {skills.map((skill) => (
            <CustomSkillRow
              key={skill.id}
              skill={skill}
              busy={update.isPending || remove.isPending}
              onToggle={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })}
              onUpdate={(patch) => update.mutate({ id: skill.id, patch })}
              onDelete={() => {
                if (confirm(`Delete skill “${skill.name}”?`)) remove.mutate(skill.id);
              }}
            />
          ))}
        </div>
      </section>

      <section className="border-t border-[#403642] pt-4">
        <div className="bf-section-label !mb-2 !mt-0">Background tasks</div>
        <div className="bf-card p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-[#d8cfc1]">Task runner</p>
              <p className="mt-1 text-[9px] leading-relaxed text-[#756f68]">No background task engine is wired yet.</p>
            </div>
            <span className="border border-[#4b414d] px-2 py-1 text-[8px] uppercase tracking-wider text-[#756f68]">not active</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[9px] uppercase tracking-[.13em] text-[#a99e91]">{label}</label>
      {children}
    </div>
  );
}

function CustomSkillRow({
  skill,
  busy,
  onToggle,
  onUpdate,
  onDelete,
}: {
  skill: BabySkill;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
  onUpdate: (patch: { name?: string; description?: string; instructions?: string }) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(skill.name);
  const [description, setDescription] = useState(skill.description);
  const [instructions, setInstructions] = useState(skill.instructions);

  const cancel = () => {
    setName(skill.name);
    setDescription(skill.description);
    setInstructions(skill.instructions);
    setEditing(false);
  };

  const save = () => {
    const nextName = name.trim();
    const nextInstructions = instructions.trim();
    if (!nextName || !nextInstructions) return toast.error("A skill needs both a name and instructions.");
    onUpdate({ name: nextName, description: description.trim(), instructions: nextInstructions });
    setEditing(false);
  };

  return (
    <div className={`bf-skill-card border p-3 ${skill.enabled ? "" : "opacity-60"}`}>
      {editing ? (
        <div className="space-y-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="Skill name" />
          <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={240} placeholder="When should Baby use it?" aria-label="When to use skill" />
          <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={4000} rows={5} className="resize-none" aria-label="Skill instructions" />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={cancel} disabled={busy}>Cancel</Button>
            <Button type="button" size="sm" onClick={save} disabled={busy || !name.trim() || !instructions.trim()} className="bf-btn-primary gap-1"><Check className="size-3.5" />Save</Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="break-words text-sm text-[#e0d6c3]">{skill.name}</p>
              <span className={`text-[8px] uppercase tracking-wider ${skill.enabled ? "text-[#baff21]" : "text-[#756f68]"}`}>
                {skill.enabled ? "active" : "off"}
              </span>
            </div>
            {skill.description && <p className="mt-1 break-words text-[10px] leading-relaxed text-[#8f8880]">{skill.description}</p>}
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[10px] leading-relaxed text-[#b9b0a5]">{skill.instructions}</p>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1">
            <Switch checked={skill.enabled} onCheckedChange={onToggle} disabled={busy} aria-label={`${skill.enabled ? "Disable" : "Enable"} ${skill.name}`} />
            <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => setEditing(true)} disabled={busy} aria-label={`Edit ${skill.name}`}><Pencil className="size-3.5" /></Button>
            <Button type="button" size="icon" variant="ghost" className="size-7 text-destructive" onClick={onDelete} disabled={busy} aria-label={`Delete ${skill.name}`}><Trash2 className="size-3.5" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
