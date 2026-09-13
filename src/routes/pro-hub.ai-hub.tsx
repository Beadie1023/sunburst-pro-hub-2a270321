import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Bot,
  Palette,
  Camera,
  Calculator,
  ArrowRight,
  Send,
  User,
  Loader2,
  Sparkles,
  Paintbrush,
  Maximize2,
  X,
} from "lucide-react";

export const Route = createFileRoute("/pro-hub/ai-hub")({
  component: AiHubPage,
  head: () => ({
    meta: [
      { title: "AI Hub — Sunburst Pro Hub" },
      {
        name: "description",
        content:
          "AI-powered tools for Bahamian contractors: color match, room visualizer, paint estimator.",
      },
    ],
  }),
});

interface ToolCard {
  title: string;
  description: string;
  icon: React.ElementType;
  href: string;
  gradient: string;
  badge?: string;
}

// 🛠️ FIXING ROUTING PARAMS TO POINT TO YOUR CONSOLIDATED TAB PAGE
const TOOLS: ToolCard[] = [
  {
    title: "AI Color Match",
    description:
      "Upload a photo of any surface and instantly find the closest Sunburst paint color from our 1,200+ catalog.",
    icon: Palette,
    href: "/pro-hub/ai-design-tools", // Points cleanly to your tabbed view setup
    gradient: "from-teal to-teal-foreground/20",
    badge: "Live",
  },
  {
    title: "Room Visualizer",
    description:
      "See any Sunburst color on your client's walls before opening a single can. Upload a room photo and preview instantly.",
    icon: Camera,
    href: "/pro-hub/ai-design-tools#visualizer",
    gradient: "from-accent to-accent-glow",
    badge: "Beta",
  },
  {
    title: "Paint Estimator",
    description:
      "Calculate exact gallons needed by room dimensions, surface type, and coats. Eliminate over-ordering waste.",
    icon: Calculator,
    href: "/pro-hub/ai-design-tools", // Fixed from "#" to link up your estimator form tab field
    gradient: "from-primary to-primary-glow",
    badge: "New",
  },
];

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const MOCK_WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi, I'm your Sunburst AI Concierge. Ask me about paint colors, coverage calculations, or which finish works best for a Bahamian coastal climate.",
  timestamp: new Date(),
};

const MOCK_RESPONSES: Record<string, string> = {
  coverage:
    "For a standard interior wall with 1 coat primer + 2 coats paint, estimate 350–400 sq ft per gallon. Marine-grade exteriors run closer to 300 sq ft/gal due to higher film build. Want me to run the exact numbers for your room dimensions?",
  finish:
    "For Nassau's high humidity and salt air, I'd recommend **Satin or Semi-Gloss** on exteriors and trims. For interiors, **Eggshell** hides imperfections while staying washable. Matte is great for ceilings but not high-traffic areas.",
  color:
    "I can match any photo to our catalog. Try the **AI Color Match** card above, or tell me the vibe — coastal blue, warm sand, luxury neutral — and I'll pull specific Sunburst codes.",
  default:
    "I'm still learning about that. In the meantime, try our AI Color Match tool or the Paint Estimator — both are designed to save you time on-site. What project are you working on?",
};

function AiHubPage() {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMinimized, setChatMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([MOCK_WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, chatOpen]);

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    // Simulate AI response with keyword matching
    setTimeout(() => {
      const text = userMsg.content.toLowerCase();
      let response = MOCK_RESPONSES.default;
      if (text.includes("coverage") || text.includes("gallon") || text.includes("sq ft")) {
        response = MOCK_RESPONSES.coverage;
      } else if (text.includes("finish") || text.includes("matte") || text.includes("gloss") || text.includes("satin")) {
        response = MOCK_RESPONSES.finish;
      } else if (text.includes("color") || text.includes("match") || text.includes("paint")) {
        response = MOCK_RESPONSES.color;
      }

      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: response,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setLoading(false);
    }, 900);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickReplies = [
    "Best finish for humid climates?",
    "Coverage per gallon?",
    "Match a color from photo",
  ];

  return (
    <div className="relative min-h-[600px] space-y-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold text-primary">
          <Sparkles className="h-7 w-7 text-accent" /> AI Hub
        </h1>
        <p className="text-muted-foreground">
          Smart tools built for Bahamian contractors. Save time, cut waste, and
          nail every color recommendation.
        </p>
      </div>

      {/* Navigation Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link key={tool.title} to={tool.href} className="group block">
              <Card className="relative h-full overflow-hidden border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-pro">
                {/* Gradient accent strip */}
                <div
                  className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${tool.gradient}`}
                />
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">
                        {tool.title}
                      </h3>
                      {tool.badge && (
                        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
                          {tool.badge}
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-accent" />
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {tool.description}
                </p>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Pro tip banner */}
      <Card className="flex items-start gap-4 border-accent/20 bg-accent/5 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Paintbrush className="h-4 w-4" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-foreground">
            Pro tip from the AI Concierge
          </h4>
          <p className="text-sm text-muted-foreground">
            Always account for 10% extra paint on exterior Bahamian projects —
            salt air and high UV can accelerate touch-up cycles. The Paint
            Estimator above factors this in automatically.
          </p>
        </div>
      </Card>
    </div>
  );
}
