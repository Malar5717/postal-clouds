import { useState } from "react";
import { useNavigate } from "react-router-dom";

import LampTransition from "../../components/effects/LampTransition";
import "./PostOfficeDesk.css";

const SENT_LETTERS = [
  { id: "test-letter", title: "The Long Way Home" },
  { id: "foggy-morning", title: "A Foggy Morning" },
  { id: "the-orchard", title: "Letters from the Orchard" },
  { id: "small-things", title: "Small Things I Noticed" },
  { id: "winter-council", title: "Winter Council Agenda" },
  { id: "the-blue-hour", title: "The Blue Hour" },
  { id: "being-late", title: "On Being Late Again" },
  { id: "april-inventory", title: "An April Inventory" },
];

function PostOfficeDesk() {
  const [selectedId, setSelectedId] = useState(null);
  const [lampPlaying, setLampPlaying] = useState(false);
  const navigate = useNavigate();

  return (
    <main className="house-desk">
      <div className="post-office-desk__art">
        <h2 className="house-desk__heading">sent</h2>
        <section className="house-desk__inbox">
          <ul>
            {SENT_LETTERS.map((letter) => (
              <li key={letter.id}>
                <button
                  type="button"
                  className="house-desk__letter"
                  aria-pressed={letter.id === selectedId}
                  onClick={() => setSelectedId(letter.id)}
                >
                  {letter.title}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <button
          type="button"
          className="house-desk__read-button"
          disabled={selectedId === null}
          onClick={() => {
            if (selectedId) navigate(`/letters/${selectedId}`);
          }}
        >
          read
        </button>

        <div className="post-office-desk__actions">
          <button
            type="button"
            className="house-desk__write-button"
            disabled={lampPlaying}
            onClick={() => setLampPlaying(true)}
          >
            write
          </button>

          <button
            type="button"
            className="house-desk__write-button"
            disabled={lampPlaying}
            onClick={() => navigate("/post-office/drafts")}
          >
            drafts
          </button>
        </div>

        <LampTransition
          play={lampPlaying}
          group="write-post-office"
          onComplete={() => {
            setLampPlaying(false);
            navigate("/post-office/compose");
          }}
        />
      </div>
    </main>
  );
}

export default PostOfficeDesk;
