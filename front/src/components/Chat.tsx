"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { FileText, RefreshCw, Send, Settings2, UserPlus } from "lucide-react";
import { api, post, patch, ApiError } from "../lib/api";
import type {
  User,
  WhatsAppConversation,
  WhatsAppMessage,
  WhatsAppNumber,
} from "../lib/types";
import { Empty } from "./WorkspaceViews";
import { ConversationListItem, MessageBubble, NumberRow } from "./ChatViews";
import { readSnapshot, writeSnapshot } from "../lib/offlineCache";

export function Chat({
  commercial,
  writer,
  currentUserId,
  users,
  onCreateClient,
}: {
  commercial: boolean;
  writer: boolean;
  currentUserId: string;
  users: User[];
  onCreateClient: (prefill: { phone: string; contactName: string }) => void;
}) {
  const [conversations, setConversations] = useState<WhatsAppConversation[]>(
    [],
  );
  const [numbers, setNumbers] = useState<WhatsAppNumber[]>([]);
  const [selected, setSelected] = useState<WhatsAppConversation | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [templateName, setTemplateName] = useState("hello_world");
  const [templateLanguage, setTemplateLanguage] = useState("es_CO");
  const [templateVariables, setTemplateVariables] = useState("");
  const [showTemplate, setShowTemplate] = useState(false);
  const [sending, setSending] = useState(false);
  const [showNumbers, setShowNumbers] = useState(false);
  const advisors = users.filter((u) => u.role === "advisor");

  const load = useCallback(async () => {
    setError("");
    const cacheKey = (name: string) => `chat:${currentUserId}:${name}`;
    const cached = await Promise.all([
      readSnapshot<WhatsAppConversation[]>(cacheKey("conversations")),
      readSnapshot<WhatsAppNumber[]>(cacheKey("numbers")),
    ]).catch(() => [null, null] as const);
    try {
      const [convos, nums] = await Promise.all([
        api<WhatsAppConversation[]>("/whatsapp/conversations"),
        commercial
          ? api<WhatsAppNumber[]>("/whatsapp/numbers")
          : Promise.resolve<WhatsAppNumber[]>([]),
      ]);
      setConversations(convos);
      setNumbers(nums);
      await Promise.all([
        writeSnapshot(cacheKey("conversations"), convos),
        writeSnapshot(cacheKey("numbers"), nums),
      ]).catch(() => undefined);
    } catch (loadError) {
      if (
        loadError instanceof ApiError &&
        loadError.status === 0 &&
        cached[0] &&
        cached[1]
      ) {
        setConversations(cached[0]);
        setNumbers(cached[1]);
        setError("Sin conexión: mostrando la última bandeja sincronizada.");
      } else setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [commercial, currentUserId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function openConversation(conversation: WhatsAppConversation) {
    setSelected(conversation);
    setMessages([]);
    setMessagesLoading(true);
    setError("");
    try {
      const conversationMessages = await api<WhatsAppMessage[]>(
        `/whatsapp/conversations/${conversation.id}/messages`,
      );
      setMessages(conversationMessages);
      await writeSnapshot(
        `chat:${currentUserId}:messages:${conversation.id}`,
        conversationMessages,
      ).catch(() => undefined);
    } catch (openError) {
      if (openError instanceof ApiError && openError.status === 0) {
        const cachedMessages = await readSnapshot<WhatsAppMessage[]>(
          `chat:${currentUserId}:messages:${conversation.id}`,
        ).catch(() => null);
        if (cachedMessages) setMessages(cachedMessages);
        else
          setError("Sin conexión: estos mensajes aún no están sincronizados.");
      } else setError((openError as Error).message);
    } finally {
      setMessagesLoading(false);
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!selected || !body) return;
    setSending(true);
    setError("");
    try {
      const message = await post<WhatsAppMessage>(
        `/whatsapp/conversations/${selected.id}/messages`,
        { body },
      );
      setMessages((current) => [...current, message]);
      setDraft("");
      void load();
    } catch (sendError) {
      setError(describe(sendError));
    } finally {
      setSending(false);
    }
  }
  async function sendTemplate(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSending(true);
    setError("");
    try {
      const message = await post<WhatsAppMessage>(
        `/whatsapp/conversations/${selected.id}/templates`,
        {
          templateName,
          languageCode: templateLanguage,
          variables: templateVariables
            .split("\n")
            .map((value) => value.trim())
            .filter(Boolean),
        },
      );
      setMessages((current) => [...current, message]);
      setTemplateVariables("");
      setShowTemplate(false);
      void load();
    } catch (sendError) {
      setError(describe(sendError));
    } finally {
      setSending(false);
    }
  }

  async function assign(numberId: string, advisorId: string | null) {
    setError("");
    try {
      await patch(`/whatsapp/numbers/${numberId}/assignment`, { advisorId });
      await load();
    } catch (assignError) {
      setError((assignError as Error).message);
    }
  }

  if (loading)
    return (
      <section className="panel">
        <div className="skeleton" />
      </section>
    );

  return (
    <>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {commercial && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Números de WhatsApp</h2>
              <p>Quién recibe los mensajes de cada línea.</p>
            </div>
            <button
              className="text-button"
              onClick={() => setShowNumbers((open) => !open)}
            >
              <Settings2 size={15} />
              {showNumbers ? "Ocultar" : "Administrar"}
            </button>
          </div>
          {showNumbers &&
            (numbers.length ? (
              <div className="number-list">
                {numbers.map((number) => (
                  <NumberRow
                    key={number.id}
                    number={number}
                    advisors={advisors}
                    onAssign={(advisorId) => assign(number.id, advisorId)}
                  />
                ))}
              </div>
            ) : (
              <p className="hint">Sin números registrados todavía.</p>
            ))}
        </section>
      )}
      <section className="panel chat-panel">
        <div className="chat-toolbar">
          <div>
            <strong>Conversaciones</strong>
            <small>
              {conversations.length
                ? `${conversations.length} hilos activos`
                : "Bandeja lista para recibir mensajes"}
            </small>
          </div>
          <button
            className="text-button"
            onClick={() => void load()}
            title="Actualizar conversaciones"
          >
            <RefreshCw size={15} /> Actualizar
          </button>
        </div>
        <div className="chat-layout">
          <div className="chat-list">
            {conversations.length ? (
              conversations.map((conversation) => (
                <ConversationListItem
                  key={conversation.id}
                  conversation={conversation}
                  active={selected?.id === conversation.id}
                  showNumberLabel={commercial}
                  onOpen={() => openConversation(conversation)}
                />
              ))
            ) : (
              <Empty
                title="Sin conversaciones todavía"
                text="Los mensajes que lleguen a tu línea aparecerán aquí."
              />
            )}
          </div>
          <div className="chat-thread">
            {selected ? (
              <>
                <div className="chat-thread-header">
                  <div>
                    <strong>
                      {selected.client?.name ??
                        selected.contactName ??
                        selected.contactPhone}
                    </strong>
                    <small>{selected.contactPhone}</small>
                  </div>
                  {writer && !selected.client && (
                    <button
                      className="text-button"
                      onClick={() =>
                        onCreateClient({
                          phone: selected.contactPhone,
                          contactName: selected.contactName ?? "",
                        })
                      }
                    >
                      <UserPlus size={15} /> Crear cliente
                    </button>
                  )}
                </div>
                <div className="chat-messages">
                  {messagesLoading ? (
                    <div className="skeleton" />
                  ) : messages.length ? (
                    messages.map((message) => (
                      <MessageBubble key={message.id} message={message} />
                    ))
                  ) : (
                    <Empty
                      title="Sin mensajes"
                      text="Todavía no hay mensajes en esta conversación."
                    />
                  )}
                </div>
                {writer ? (
                  <div className="chat-compose-wrap">
                    {showTemplate && (
                      <form className="template-form" onSubmit={sendTemplate}>
                        <div className="form-grid">
                          <label>
                            Plantilla aprobada
                            <input
                              value={templateName}
                              onChange={(event) =>
                                setTemplateName(event.target.value)
                              }
                              pattern="[a-z0-9_]+"
                              minLength={2}
                              maxLength={512}
                              required
                            />
                          </label>
                          <label>
                            Idioma
                            <input
                              value={templateLanguage}
                              onChange={(event) =>
                                setTemplateLanguage(event.target.value)
                              }
                              pattern="[a-z]{2,3}(_[A-Z]{2})?"
                              required
                            />
                          </label>
                        </div>
                        <label>
                          Variables, una por línea
                          <textarea
                            value={templateVariables}
                            onChange={(event) =>
                              setTemplateVariables(event.target.value)
                            }
                            maxLength={4096}
                          />
                        </label>
                        <div className="template-actions">
                          <button
                            className="secondary"
                            type="button"
                            onClick={() => setShowTemplate(false)}
                            disabled={sending}
                          >
                            Cancelar
                          </button>
                          <button className="primary" disabled={sending}>
                            Enviar plantilla
                          </button>
                        </div>
                      </form>
                    )}
                    <form className="chat-composer" onSubmit={sendMessage}>
                      <button
                        className="secondary icon-only"
                        type="button"
                        aria-label="Enviar plantilla aprobada por Meta"
                        title="Enviar plantilla aprobada por Meta"
                        onClick={() => setShowTemplate((open) => !open)}
                        disabled={sending}
                      >
                        <FileText size={17} />
                      </button>
                      <input
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder="Escribe un mensaje…"
                        maxLength={4096}
                        disabled={sending}
                      />
                      <button
                        className="primary icon-only"
                        type="submit"
                        disabled={sending || !draft.trim()}
                        aria-label="Enviar mensaje"
                      >
                        <Send size={17} />
                      </button>
                    </form>
                  </div>
                ) : (
                  <p className="hint chat-readonly">
                    Solo la coordinación comercial y el asesor de esta línea
                    pueden responder.
                  </p>
                )}
              </>
            ) : (
              <Empty
                title="Elige una conversación"
                text="Selecciona un chat de la lista para ver los mensajes."
              />
            )}
          </div>
        </div>
      </section>
    </>
  );
}

function describe(error: unknown) {
  if (error instanceof ApiError && error.status === 404)
    return "Ya no tienes acceso a esta conversación. Actualiza la página.";
  return (error as Error).message;
}
