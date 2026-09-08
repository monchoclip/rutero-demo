import {
  Check,
  CheckCheck,
  Clock,
  AlertTriangle,
  Image as ImageIcon,
  Video,
  Mic,
  FileText,
} from "lucide-react";
import type {
  WhatsAppConversation,
  WhatsAppMessage,
  WhatsAppNumber,
} from "../lib/types";

const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
const timeOnly = (date: string) =>
  new Date(date).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });
export const relativeTime = (date: string) => {
  const minutes = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return new Date(date).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
  });
};

export function ConversationListItem({
  conversation,
  active,
  showNumberLabel,
  onOpen,
}: {
  conversation: WhatsAppConversation;
  active: boolean;
  showNumberLabel: boolean;
  onOpen: () => void;
}) {
  const name = conversation.client?.name ?? conversation.contactName;
  return (
    <button
      className={`chat-list-item ${active ? "active" : ""}`}
      onClick={onOpen}
    >
      <span className="avatar">
        {initials(name ?? conversation.contactPhone)}
      </span>
      <span className="chat-list-info">
        <strong>{name ?? conversation.contactPhone}</strong>
        <small>
          {conversation.contactPhone}
          {showNumberLabel ? ` · ${conversation.whatsAppNumber.label}` : ""}
        </small>
      </span>
      <span className="chat-list-time">
        {relativeTime(conversation.lastMessageAt)}
      </span>
    </button>
  );
}

function StatusIcon({ status }: { status: WhatsAppMessage["status"] }) {
  if (status === "failed")
    return <AlertTriangle size={13} className="status-failed" />;
  if (status === "read" || status === "delivered")
    return (
      <CheckCheck
        size={13}
        className={status === "read" ? "status-read" : ""}
      />
    );
  if (status === "sent") return <Check size={13} />;
  return <Clock size={13} />;
}

function MediaPlaceholder({ type }: { type: WhatsAppMessage["type"] }) {
  const Icon =
    type === "image"
      ? ImageIcon
      : type === "video"
        ? Video
        : type === "audio"
          ? Mic
          : FileText;
  const label =
    type === "image"
      ? "Imagen"
      : type === "video"
        ? "Video"
        : type === "audio"
          ? "Audio"
          : "Documento";
  return (
    <span className="media-placeholder">
      <Icon size={16} /> {label}
      <small>
        Sin credenciales de Meta configuradas: no se puede descargar.
      </small>
    </span>
  );
}

export function MessageBubble({ message }: { message: WhatsAppMessage }) {
  const outbound = message.direction === "outbound";
  return (
    <div className={`chat-bubble-row ${outbound ? "outbound" : "inbound"}`}>
      <div className="chat-bubble">
        {message.type !== "text" && !message.mediaUrl && (
          <MediaPlaceholder type={message.type} />
        )}
        {message.type === "image" && message.mediaUrl && (
          <img src={message.mediaUrl} alt="" />
        )}
        {message.type === "video" && message.mediaUrl && (
          <video controls src={message.mediaUrl} />
        )}
        {message.type === "audio" && message.mediaUrl && (
          <audio controls src={message.mediaUrl} />
        )}
        {message.type === "document" && message.mediaUrl && (
          <a
            className="media-link"
            href={message.mediaUrl}
            download={`whatsapp-${message.id}`}
          >
            <FileText size={16} /> Descargar documento
          </a>
        )}
        {message.body && <p>{message.body}</p>}
        <span className="chat-bubble-meta">
          {timeOnly(message.createdAt)}
          {outbound && <StatusIcon status={message.status} />}
        </span>
      </div>
    </div>
  );
}

export function NumberRow({
  number,
  advisors,
  onAssign,
}: {
  number: WhatsAppNumber;
  advisors: { id: string; name: string }[];
  onAssign: (advisorId: string | null) => void;
}) {
  return (
    <div className="number-row">
      <div>
        <strong>{number.label}</strong>
        <small>{number.displayPhoneNumber}</small>
      </div>
      <select
        value={number.advisor?.id ?? ""}
        onChange={(event) => onAssign(event.target.value || null)}
      >
        <option value="">Sin asignar</option>
        {advisors.map((advisor) => (
          <option key={advisor.id} value={advisor.id}>
            {advisor.name}
          </option>
        ))}
      </select>
    </div>
  );
}
