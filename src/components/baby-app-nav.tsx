import { Link } from "@tanstack/react-router";
import { Brain, CalendarDays, MessageCircle, NotebookTabs, Wrench } from "lucide-react";

export type BabyNavKey = "notebook" | "calendar" | "chat" | "brain" | "skills";

type Props = {
  active?: BabyNavKey;
  onChat?: () => void;
  onSkills?: () => void;
};

export function BabyAppNav({ active, onChat, onSkills }: Props) {
  const chat = onChat ? (
    <button type="button" className={`bf-nav-item ${active === "chat" ? "active" : ""}`} onClick={onChat}>
      <MessageCircle />
      <span>Chat</span>
    </button>
  ) : (
    <a className={`bf-nav-item ${active === "chat" ? "active" : ""}`} href="/?panel=chat">
      <MessageCircle />
      <span>Chat</span>
    </a>
  );

  const skills = onSkills ? (
    <button type="button" className={`bf-nav-item ${active === "skills" ? "active" : ""}`} onClick={onSkills}>
      <Wrench />
      <span>Skills</span>
    </button>
  ) : (
    <a className={`bf-nav-item ${active === "skills" ? "active" : ""}`} href="/?panel=skills">
      <Wrench />
      <span>Skills</span>
    </a>
  );

  return (
    <nav className="bf-nav" aria-label="Baby navigation">
      <div className="bf-nav-inner">
        <Link to="/" className={`bf-nav-item ${active === "notebook" ? "active" : ""}`}>
          <NotebookTabs />
          <span>Notebook</span>
        </Link>
        <Link to="/calendar" className={`bf-nav-item ${active === "calendar" ? "active" : ""}`}>
          <CalendarDays />
          <span>Calendar</span>
        </Link>
        {chat}
        <Link to="/brain" className={`bf-nav-item ${active === "brain" ? "active" : ""}`}>
          <Brain />
          <span>Brain</span>
        </Link>
        {skills}
      </div>
    </nav>
  );
}
