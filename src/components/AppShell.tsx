import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import clsx from "clsx";
import { measureServerLatency } from "../lib/apiClient";

const navItems = [
  { to: "/", label: "Overview" },
  { to: "/performance", label: "Performance" },
  { to: "/transactions", label: "Transactions" },
];

export function AppShell() {
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;

    const runProbe = async () => {
      const next = await measureServerLatency();
      if (mounted) {
        setLatencyMs(next);
      }
    };

    void runProbe();
    const intervalId = window.setInterval(() => {
      void runProbe();
    }, 7000);

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-dot" />
          <div>
            <div className="brand-title">QUANT BACKTEST LAB</div>
            <div className="brand-subtitle">US Equities Momentum + Quality</div>
          </div>
        </div>
        <div className="live-pill">
          <span
            className={latencyMs === null ? "live-dot degraded" : "live-dot"}
          />
          <span>WS LIVE</span>
          <span className="live-latency">
            {latencyMs === null ? "offline" : `${latencyMs}ms`}
          </span>
        </div>
      </header>

      <nav className="nav-tabs">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => clsx("nav-tab", { active: isActive })}
            end={item.to === "/"}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <main className="page-content">
        <Outlet />
      </main>
    </div>
  );
}
