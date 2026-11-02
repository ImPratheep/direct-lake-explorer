# Stage 4 Setup Instructions

## Prerequisites
- Node.js 18+ installed
- npm or yarn package manager

## Quick Start

### Step 1: Create Directory Structure
```bash
mkdir -p src/{components,data,types,utils}
mkdir -p tests/{components,utils}
mkdir -p public
```

### Step 2: Initialize Project
```bash
npm install
```

### Step 3: Run Development Server
```bash
npm run dev
```

The application will start at `http://localhost:3000`

### Step 4: Build for Production
```bash
npm run build
```

### Step 5: Run Tests
```bash
npm run test
```

---

## File Structure After Setup

```
DirectLakeExplorer/
├── src/
│   ├── components/          # React components
│   │   ├── ArchitectureExplorer.tsx
│   │   ├── DetailPanel.tsx
│   │   ├── DataFlowWalkthrough.tsx
│   │   ├── Legend.tsx
│   │   └── QueryWalkthrough.tsx
│   ├── data/                # Application data
│   │   ├── components.ts    # 121 architecture components
│   │   └── queryPhases.ts   # 6-phase pipeline
│   ├── types/               # TypeScript types
│   │   └── index.ts
│   ├── utils/               # Utility functions
│   │   ├── svg.ts
│   │   └── accessibility.ts
│   ├── App.tsx              # Main application
│   ├── index.tsx            # React entry point
│   └── index.css            # Global styles
├── tests/                   # Test files
│   ├── components/
│   └── utils/
├── public/                  # Static assets
│   └── direct-lake-architecture.svg
├── index.html               # HTML entry point
├── package.json             # Dependencies
├── tsconfig.json            # TypeScript config
├── vite.config.ts           # Vite config
├── vitest.config.ts         # Test config
└── README.md                # Project documentation
```

---

## Development Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run test` | Run tests in watch mode |
| `npm run test:ui` | Run tests with UI |
| `npm run lint` | Lint code (if configured) |

---

## Project Overview

**Stage 4: Interactive Direct Lake Architecture Explorer**

A React-based web application that visualizes and explains Microsoft Fabric Direct Lake architecture through:

- **Interactive SVG Components** - Click any of 121 architecture components for details
- **Multi-Level Explanations** - Beginner, Intermediate, and Advanced modes
- **Query Pipeline Visualization** - 6-phase data flow walkthrough
- **Documentation Links** - All components linked to Microsoft Learn sources
- **Responsive Design** - Works on mobile (390px), tablet (768px), and desktop (1200px+)
- **Dark Theme** - Professional dark UI matching Stage 3 illustration

---

## Architecture

### Component Hierarchy
```
App
├── Header
├── Controls (mode selector, buttons)
├── Main
│   ├── ArchitectureExplorer (SVG canvas)
│   ├── DetailPanel (component info)
│   ├── DataFlowWalkthrough (query pipeline)
│   └── Legend (documentation)
└── Footer
```

### Key Features
1. **Interactive Selection** - Click components to view details
2. **Explanation Modes** - Toggle between beginner/intermediate/advanced
3. **Query Walkthrough** - Step through 6-phase query execution
4. **Keyboard Navigation** - Tab, Enter, Arrow keys, Escape
5. **Responsive** - Mobile-friendly at all breakpoints
6. **Accessibility** - ARIA labels, high contrast, screen reader support

---

## Technology Stack

| Technology | Purpose | Version |
|------------|---------|---------|
| React | UI Framework | 18.2 |
| TypeScript | Type Safety | 5.0 |
| Vite | Build Tool | 5.0 |
| Vitest | Test Runner | 0.34 |
| React Testing Library | Component Testing | 14.0 |
| React Spring | Animations | 9.7 |
| React Icons | Icon Library | 4.11 |
| CSS Modules | Scoped Styling | - |

---

## Security & Compliance

✅ **Local-Only Operation**
- No external API calls
- No network requests
- Synthetic data only
- No Fabric account required

✅ **Security**
- TypeScript type safety
- No eval or dynamic code execution
- Sandbox compatible
- All dependencies from npm

✅ **Documentation**
- All components reference Microsoft Learn
- [DOCUMENTED] vs [SIMULATION] clearly marked
- 19 Microsoft sources cited
- Technical accuracy verified

---

## Next Steps

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Create Directory Structure**
   ```bash
   mkdir -p src/{components,data,types,utils} tests/{components,utils}
   ```

3. **Copy React Component Files**
   - Copy `App.tsx` to `src/App.tsx`
   - Copy component files to `src/components/`
   - Copy data files to `src/data/`
   - Copy type definitions to `src/types/`

4. **Start Development**
   ```bash
   npm run dev
   ```

5. **Build for Production**
   ```bash
   npm run build
   ```

---

## Troubleshooting

### Port 3000 Already in Use
```bash
npm run dev -- --port 3001
```

### Clear Cache and Reinstall
```bash
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### TypeScript Errors
```bash
npm install -D typescript
npm run dev
```

---

## Stage 4 Deliverables

✅ React application with 5 interactive components  
✅ 121 architecture components with full metadata  
✅ 6-phase query pipeline visualization  
✅ Multi-level explanations (beginner/intermediate/advanced)  
✅ Legend with [DOCUMENTED]/[SIMULATION]/[INFERRED] classifications  
✅ Responsive design (390px - 1920px+)  
✅ Keyboard navigation and accessibility  
✅ Component tests and integration tests  
✅ Complete documentation  

---

## Support

For issues or questions:
1. Check `.github/copilot-instructions.md` for project rules
2. Review `TECHNICAL_GLOSSARY.md` for terminology
3. See `RESEARCH_SOURCES.md` for documentation references
4. Check `STAGE_3_COMPONENT_MAPPING.md` for component structure

---

**Ready to develop! Start with `npm install` and `npm run dev`**
