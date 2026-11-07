import { useState } from "react";
import { useNavigate } from "react-router-dom";

import LampTransition from "../../components/effects/LampTransition";
import StampsOverlay from "./StampsOverlay";
import "./HouseDesk.css";

/* Placeholder inbox data. Replaced by real received letters later. */
const RECEIVED_LETTERS = [
  { id: "test-letter", title: "The Long Way Home" },
  { id: "foggy-morning", title: "A Foggy Morning" },
  { id: "the-orchard", title: "Letters from the Orchard" },
  { id: "small-things", title: "Small Things I Noticed" },
  { id: "winter-council", title: "Winter Council Agenda" },
  { id: "the-blue-hour", title: "The Blue Hour" },
  { id: "being-late", title: "On Being Late Again" },
  { id: "april-inventory", title: "An April Inventory" },
];

function HouseDesk() {
  const [selectedId, setSelectedId] = useState(null);
  const [stampsOpen, setStampsOpen] = useState(false);
  const [lampPlaying, setLampPlaying] = useState(false);
  const navigate = useNavigate();

  return (
    <main className="house-desk">
      <div className="house-desk__art">

        <button
          type="button"
          className="house-desk__stamps-button"
          onClick={() => setStampsOpen(true)}
          aria-label="Open stamp collection"
        />

        <h2 className="house-desk__heading">received</h2>
        <section className="house-desk__inbox">
          <ul>
            {RECEIVED_LETTERS.map((letter) => (
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
          disabled={selectedId === null || lampPlaying}
          onClick={() => setLampPlaying(true)}
        >
          read
        </button>

        {stampsOpen && (
          <StampsOverlay onClose={() => setStampsOpen(false)} />
        )}

        <LampTransition
          play={lampPlaying}
          group="read-house"
          onComplete={() => {
            setLampPlaying(false);
            navigate(`/letters/${selectedId}`);
          }}
        />
      </div>
    </main>
  );
}

export default HouseDesk;