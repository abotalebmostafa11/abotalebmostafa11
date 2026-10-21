#!/usr/bin/env python3
"""Build the profile's self-contained SVG artwork with Python's standard library."""

from html import escape
from pathlib import Path
import math


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
FONT = "Arial, Helvetica, sans-serif"
MONO = "'Courier New', monospace"
THEMES = {
    "dark": {
        "bg": "#0B1623", "panel": "#101F2E", "text": "#F0F6FC",
        "muted": "#B0C2D4", "line": "#294151", "accent": "#71E5C3",
        "blue": "#88B7FF", "gold": "#E9C980", "wash": "#122D35",
    },
    "light": {
        "bg": "#F2F7FA", "panel": "#E5EEF4", "text": "#122D40",
        "muted": "#435F72", "line": "#C4D4DF", "accent": "#086956",
        "blue": "#275DA8", "gold": "#866210", "wash": "#DCEEE9",
    },
}


def text(x, y, value, size, color, weight=400, family=FONT, extra=""):
    return (f'<text x="{x}" y="{y}" fill="{color}" font-family="{family}" '
            f'font-size="{size}" font-weight="{weight}" {extra}>'
            f'{escape(value)}</text>')


def svg(width, height, title, description, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
            f'viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">'
            f'<title id="title">{escape(title)}</title>'
            f'<desc id="desc">{escape(description)}</desc>{body}</svg>\n')


def orbit_art(t):
    """Decorative geometric illustration. It does not represent measured data."""
    parts = [
        f'<circle cx="1050" cy="196" r="158" fill="{t["wash"]}"/>',
        f'<circle cx="1050" cy="196" r="128" fill="none" stroke="{t["line"]}"/>',
        f'<circle cx="1050" cy="196" r="96" fill="none" stroke="{t["line"]}"/>',
        f'<circle cx="1050" cy="196" r="64" fill="none" stroke="{t["line"]}"/>',
        f'<path d="M868 196H1234M1050 28V364" stroke="{t["line"]}" stroke-dasharray="3 7"/>',
        f'<ellipse cx="1050" cy="196" rx="169" ry="60" transform="rotate(-33 1050 196)" '
        f'fill="none" stroke="{t["blue"]}" stroke-width="1.6" opacity=".65"/>',
    ]
    for n in range(9):
        points = []
        for j in range(75):
            x = 906 + j * 3.9
            y = 145 + n * 14 + math.sin(j / 9 + n / 3) * 18 + math.cos(j / 17) * 9
            points.append(f"{x:.1f},{y:.1f}")
        parts.append(f'<polyline points="{" ".join(points)}" fill="none" '
                     f'stroke="{t["accent"]}" stroke-width="1.2" opacity="{.25 + n * .055:.2f}"/>')
    for x, y, r, c in [(952, 77, 5, "blue"), (1170, 154, 5, "accent"),
                        (1005, 315, 4, "gold"), (1083, 102, 3, "accent")]:
        parts.append(f'<circle cx="{x}" cy="{y}" r="{r+6}" fill="{t[c]}" opacity=".1"/>')
        parts.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{t[c]}"/>')
    parts += [
        text(1141, 56, "EO / AI", 12, t["muted"], family=MONO),
        text(1138, 340, "RESEARCH", 11, t["muted"], family=MONO),
    ]
    return "".join(parts)


def hero(theme):
    t = THEMES[theme]
    body = (
        f'<rect width="1280" height="500" rx="20" fill="{t["bg"]}"/>'
        f'<rect x="1" y="1" width="1278" height="498" rx="19" fill="none" stroke="{t["line"]}"/>'
        f'<path d="M48 50H92" stroke="{t["accent"]}" stroke-width="4"/>'
        + text(108, 55, "RESEARCH  /  SOFTWARE  /  TEACHING", 14, t["accent"], 600, MONO)
        + text(48, 157, "Mostafa", 65, t["text"], 700)
        + text(48, 229, "Abotaleb", 65, t["text"], 700)
        + text(50, 281, "Associate Professor", 25, t["accent"], 600)
        + text(50, 314, "Head of the Laboratory of Integrated Digital Solutions", 21, t["text"])
        + text(50, 355, "AI. Earth observation. Time-series forecasting.", 22, t["muted"])
        + f'<path d="M48 387H800" stroke="{t["line"]}"/>'
        + text(50, 421, "YUGRA STATE UNIVERSITY", 16, t["text"], 600, MONO)
        + text(50, 448, "Engineering School of Digital Technologies", 16, t["muted"])
        + text(50, 475, "16, Chekhova Street · Khanty-Mansiysk 628012 · Russia", 16, t["muted"])
        + '<g transform="translate(0 35)">' + orbit_art(t) + '</g>'
    )
    return svg(1280, 500, "Mostafa Abotaleb", "Associate Professor and Head of the Laboratory of Integrated Digital Solutions. Engineering School of Digital Technologies, Yugra State University. 16, Chekhova Street, Khanty-Mansiysk 628012, Russia.", body)


def mobile_hero(theme):
    t = THEMES[theme]
    body = (
        f'<rect width="720" height="620" rx="20" fill="{t["bg"]}"/>'
        f'<rect x="1" y="1" width="718" height="618" rx="19" fill="none" stroke="{t["line"]}"/>'
        f'<path d="M40 44H67" stroke="{t["accent"]}" stroke-width="4"/>'
        + text(82, 49, "RESEARCH / SOFTWARE / TEACHING", 14, t["accent"], 600, MONO)
        + text(38, 143, "Mostafa", 62, t["text"], 700)
        + text(38, 214, "Abotaleb", 62, t["text"], 700)
        + text(40, 276, "Associate Professor", 28, t["accent"], 600)
        + text(40, 319, "Head of the Laboratory", 25, t["text"])
        + text(40, 354, "of Integrated Digital Solutions", 25, t["text"])
        + text(40, 402, "AI. Earth observation. Forecasting.", 23, t["muted"])
        + f'<path d="M40 440H680" stroke="{t["line"]}"/>'
        + text(40, 483, "YUGRA STATE UNIVERSITY", 19, t["text"], 600, MONO)
        + text(40, 516, "Engineering School of Digital Technologies", 19, t["muted"])
        + text(40, 552, "Khanty-Mansiysk, Russia", 20, t["muted"])
        + text(40, 586, "16, Chekhova Street · 628012", 19, t["muted"])
        + '<g transform="translate(55 55) scale(.5)">' + orbit_art(t) + '</g>'
    )
    return svg(720, 620, "Mostafa Abotaleb", "Associate Professor and Head of the Laboratory of Integrated Digital Solutions. Yugra State University, 16, Chekhova Street, Khanty-Mansiysk 628012, Russia.", body)


RESEARCH_PROFILES = [
    ("scopus", "Scopus", "Sc", "gold"),
    ("web-of-science", "Web of Science", "W", "blue"),
    ("google-scholar", "Google Scholar", "G", "blue"),
    ("researchgate", "ResearchGate", "RG", "accent"),
    ("researchid", "ResearchID.co", "ID", "accent"),
    ("elibrary", "eLIBRARY.RU", "eL", "gold"),
]


def profile_button(profile, theme):
    slug, label, initials, accent = profile
    t = THEMES[theme]
    c = t[accent]
    body = (
        f'<rect x="1" y="1" width="238" height="64" rx="12" fill="{t["bg"]}" stroke="{t["line"]}"/>'
        f'<circle cx="31" cy="33" r="16" fill="{t["wash"]}"/>'
        + text(31, 38, initials, 13, c, 700, FONT, 'text-anchor="middle"')
        + text(59, 39, label, 18, t["text"], 600)
        + f'<path d="M215 27h8v8M223 27l-9 9" fill="none" stroke="{c}" stroke-width="1.5"/>'
    )
    return svg(240, 66, label, f"Open Mostafa Abotaleb's {label} profile.", body)


def motif(kind, t, color):
    prefix = f'<g fill="none" stroke="{color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'
    if kind == "earth":
        inner = '<path d="M445 43l45-16 45 16-45 17zM445 59l45 17 45-17M445 76l45 17 45-17M445 93l45 17 45-17"/>'
        inner += '<path d="M490 27v83" stroke-dasharray="2 5" opacity=".4"/>'
    elif kind == "ensemble":
        inner = '<path d="M439 104h101M443 108V30" opacity=".35"/>'
        inner += '<path d="M450 92l15-25 14 10 16-31 15 13 22-26" opacity=".45"/>'
        inner += '<path d="M450 85l15-7 14-22 16 6 15-19 22 7" opacity=".45"/>'
        inner += '<path d="M450 89l15-16 14-7 16-12 15-3 22-10" stroke-width="3"/>'
    elif kind == "network":
        inner = ""
        for x1, ys1, x2, ys2 in [(448, [46, 89], 488, [29, 67, 105]), (488, [29, 67, 105], 531, [46, 89])]:
            for y1 in ys1:
                for y2 in ys2:
                    inner += f'<path d="M{x1} {y1}L{x2} {y2}" opacity=".3"/>'
        for x, ys in [(448, [46, 89]), (488, [29, 67, 105]), (531, [46, 89])]:
            for y in ys:
                inner += f'<circle cx="{x}" cy="{y}" r="5" fill="{t["bg"]}"/>'
    elif kind == "gldm":
        inner = '<path d="M439 104h102M443 108V28" opacity=".35"/>'
        inner += '<path d="M450 96C474 96 476 89 484 67S506 36 536 34" stroke-width="3"/>'
        inner += '<path d="M450 103C477 103 483 97 491 75S516 41 536 41" opacity=".35"/>'
        inner += '<circle cx="476" cy="82" r="3"/><circle cx="499" cy="43" r="3"/>'
    elif kind == "tuning":
        inner = '<path d="M453 30v76M489 30v76M525 30v76" opacity=".45"/>'
        for x, y in [(453, 51), (489, 82), (525, 42)]:
            inner += f'<rect x="{x-7}" y="{y-5}" width="14" height="10" rx="3" fill="{t["bg"]}"/>'
    else:
        inner = '<path d="M457 32h-12v75h12M522 32h12v75h-12"/>'
        for x in [468, 490, 512]:
            for y in [45, 69, 93]:
                inner += f'<circle cx="{x}" cy="{y}" r="2" fill="{color}"/>'
        inner += '<path d="M464 44l52 50" opacity=".4"/>'
    return prefix + inner + "</g>"


PROJECTS = [
    ("eochrono", "01 / EARTH OBSERVATION", "EOChrono", "PYTHON  /  QGIS", "earth", "accent"),
    ("ensemble", "02 / TIME-SERIES FORECASTING", "ET-System", "R  /  ENSEMBLE MODELS", "ensemble", "blue"),
    ("deep-learning", "03 / DEEP LEARNING", "DL-System", "PYTHON  /  NEURAL NETWORKS", "network", "blue"),
    ("gldm", "04 / MATHEMATICAL MODELLING", "GLDM-model", "MODELS  /  FORECAST RESULTS", "gldm", "accent"),
    ("tuning", "05 / MODEL DEVELOPMENT", "LSTM Tuning", "PYTHON  /  EXPERIMENTS", "tuning", "gold"),
    ("linear-algebra", "06 / MATHEMATICS EDUCATION", "Linear Algebra", "WOLFRAM LANGUAGE  /  NOTEBOOKS", "matrix", "gold"),
]


def card(project, theme):
    slug, label, name, tech, kind, accent = project
    t = THEMES[theme]
    color = t[accent]
    body = (
        f'<rect width="580" height="146" rx="10" fill="{t["bg"]}"/>'
        f'<path d="M24 25h24" stroke="{color}" stroke-width="3"/>'
        + text(58, 29, label, 11, t["muted"], 600, MONO)
        + text(24, 81, name, 32, t["text"], 700)
        + text(25, 117, tech, 11, color, 600, MONO)
        + f'<path d="M420 24v98" stroke="{t["line"]}"/>'
        + motif(kind, t, color)
    )
    return svg(580, 146, name, f"{name}. {label[5:].lower()}. {tech.lower()}.", body)


def main():
    ASSETS.mkdir(exist_ok=True)
    for theme in THEMES:
        (ASSETS / f"hero-{theme}.svg").write_text(hero(theme), encoding="utf-8")
        (ASSETS / f"hero-mobile-{theme}.svg").write_text(mobile_hero(theme), encoding="utf-8")
        for project in PROJECTS:
            (ASSETS / f"{project[0]}-{theme}.svg").write_text(card(project, theme), encoding="utf-8")
        for profile in RESEARCH_PROFILES:
            (ASSETS / f"profile-{profile[0]}-{theme}.svg").write_text(profile_button(profile, theme), encoding="utf-8")
    print("Built 28 self-contained SVG assets.")


if __name__ == "__main__":
    main()
