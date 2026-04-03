# Kitchen & R&D — Domain Context

## Scope
Recipe development, BOM management, nutrition calculations, food safety, fermentation experiments, technique refinement, plating standards.

## Key Systems
- **Chef Agent** (`agents/chef/`): BOM, nutrition, cost calculation, recipe flows
- **SYRVE**: Menu items, production orders
- **Admin Panel**: BOM Hub, Production Orders, Cook Station

## Current Priorities
- Lego BOM compliance: every SALE must have complete BOM chain
- Nutrition accuracy: KBZHU per serving on every dish
- Production flow: step-by-step instructions with equipment allocation

## Typical Tasks
- New dish development (recipe → BOM → nutrition → cost → launch)
- Recipe optimization (reduce food cost while maintaining quality)
- Seasonal ingredient integration
- Fermentation experiments (timing, temperature, yield)
- Food safety protocol updates
- Equipment utilization improvement

## Assets Location
- Recipe photos: `01_Business/Menu/Photo/`
- Technical cards: `01_Business/Menu/TTC/`
- Chef agent knowledge: `agents/chef/knowledge/` (221 files)
