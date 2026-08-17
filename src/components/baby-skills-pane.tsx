import { useState, type FormEvent } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Check,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
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
    onError: (e: Error) => {
      toast.error(e.message || "Baby couldn't learn that skill.");
    },
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
    }) =>
      updateSkill({
        data: {
          id,
          ...patch,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["baby_skills"] });
    },
    onError: (e: Error) => {
      toast.error(e.message || "Baby couldn't update that skill.");
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteSkill({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["baby_skills"] });
      toast.success("Skill deleted.");
    },
    onError: (e: Error) => {
      toast.error(e.message || "Baby couldn't delete that skill.");
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Give the skill a name first.");
      return;
    }

    if (!instructions.trim()) {
      toast.error("Tell Baby what the skill should do.");
      return;
    }

    if (!add.isPending) add.mutate();
  };

  return (
    <div className="h-full overflow-y-auto p-3 space-y-5">
      <section className="space-y-2">
        <div>
          <h3 className="font-display text-base text-foreground">
            Built-in skills
          </h3>
          <p className="text-xs text-muted-foreground">
            These are wired into Baby and always available.
          </p>
        </div>

        <div className="space-y-2">
          {BUILT_IN_SKILLS.map((skill) => (
            <div
              key={skill.id}
              className="rounded-xl border border-border/60 bg-background/50 p-3"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm text-foreground">
                    {skill.name}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {skill.description}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary">
                  Built in
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base text-foreground">
              Custom skills
            </h3>
            <p className="text-xs text-muted-foreground">
              Teach Baby repeatable ways to handle specific jobs.
            </p>
          </div>

          <Button
            type="button"
            size="sm"
            variant={creating ? "ghost" : "outline"}
            onClick={() => setCreating((value) => !value)}
            className="shrink-0 gap-1"
          >
            {creating ? (
              <X className="size-3.5" />
            ) : (
              <Plus className="size-3.5" />
            )}
            {creating ? "Cancel" : "New"}
          </Button>
        </div>

        {creating && (
          <form
            onSubmit={submit}
            className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-3"
          >
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">
                Skill name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Gig Prep"
                maxLength={80}
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">
                When should Baby use it?
              </label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="When I ask Baby to prep for an upcoming DJ gig."
                maxLength={240}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">
                What should Baby do?
              </label>
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Check the calendar for the gig, summarize the details, then make a short prep checklist..."
                rows={5}
                maxLength={4000}
                className="resize-none"
              />
            </div>

            <Button
              type="submit"
              size="sm"
              className="w-full gap-2"
              disabled={add.isPending || !name.trim() || !instructions.trim()}
            >
              {add.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Teach Baby this skill
            </Button>
          </form>
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading skills…
          </div>
        )}

        {!isLoading && skills.length === 0 && !creating && (
          <p className="rounded-xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
            No custom skills yet. Add one when you want Baby to repeat a specific workflow your way.
          </p>
        )}

        <div className="space-y-2">
          {skills.map((skill) => (
            <CustomSkillRow
              key={skill.id}
              skill={skill}
              busy={update.isPending || remove.isPending}
              onToggle={(enabled) =>
                update.mutate({
                  id: skill.id,
                  patch: { enabled },
                })
              }
              onUpdate={(patch) =>
                update.mutate({
                  id: skill.id,
                  patch,
                })
              }
              onDelete={() => {
                const ok = confirm(`Delete skill "${skill.name}"?`);
                if (ok) remove.mutate(skill.id);
              }}
            />
          ))}
        </div>
      </section>
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
  onUpdate: (patch: {
    name?: string;
    description?: string;
    instructions?: string;
  }) => void;
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

    if (!nextName || !nextInstructions) {
      toast.error("A skill needs both a name and instructions.");
      return;
    }

    onUpdate({
      name: nextName,
      description: description.trim(),
      instructions: nextInstructions,
    });
    setEditing(false);
  };

  return (
    <div
      className={`rounded-xl border p-3 ${
        skill.enabled
          ? "border-border/60 bg-background/50"
          : "border-border/40 bg-muted/20 opacity-70"
      }`}
    >
      {editing ? (
        <div className="space-y-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            aria-label="Skill name"
          />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={240}
            placeholder="When should Baby use it?"
            aria-label="When to use skill"
          />
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            maxLength={4000}
            rows={5}
            className="resize-none"
            aria-label="Skill instructions"
          />

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={cancel}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={save}
              disabled={busy || !name.trim() || !instructions.trim()}
              className="gap-1"
            >
              <Check className="size-3.5" />
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm text-foreground break-words">
                {skill.name}
              </p>
              {!skill.enabled && (
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Off
                </span>
              )}
            </div>

            {skill.description && (
              <p className="mt-1 text-xs text-muted-foreground break-words">
                {skill.description}
              </p>
            )}

            <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-foreground/80">
              {skill.instructions}
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-center gap-1">
            <Switch
              checked={skill.enabled}
              onCheckedChange={onToggle}
              disabled={busy}
              aria-label={`${skill.enabled ? "Disable" : "Enable"} ${skill.name}`}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={() => setEditing(true)}
              disabled={busy}
              aria-label={`Edit ${skill.name}`}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 text-destructive"
              onClick={onDelete}
              disabled={busy}
              aria-label={`Delete ${skill.name}`}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
