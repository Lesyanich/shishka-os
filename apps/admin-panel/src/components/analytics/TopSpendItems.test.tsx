import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ABC_ITEMS } from '../../lib/__fixtures__/analytics-purchases-prod'
import { topSpendItems } from '../../lib/analyticsPurchases'
import { TopSpendItems } from './TopSpendItems'

const VIEW = topSpendItems(ABC_ITEMS)

describe('TopSpendItems', () => {
  it('lists the items in spend order', () => {
    const { container } = render(<TopSpendItems view={VIEW} isLoading={false} />)
    expect(container.querySelectorAll('li')).toHaveLength(20)
    expect(screen.getByText("Extra Virgin Olive Oil 'Ybarra' / 5L Pail")).toBeInTheDocument()
    expect(screen.getByText('1,250')).toBeInTheDocument()
  })

  it('badges the stubs and the items nothing consumes', () => {
    render(<TopSpendItems view={VIEW} isLoading={false} />)
    expect(screen.getAllByText('stub')).toHaveLength(18)
    expect(screen.getAllByText('no BOM')).toHaveLength(18)
  })

  it('badges the ABC class where one exists', () => {
    render(<TopSpendItems view={VIEW} isLoading={false} />)
    expect(screen.getAllByText('A')).toHaveLength(2)
  })

  it('spells out that the list mostly reflects the unfinished backfill', () => {
    render(<TopSpendItems view={VIEW} isLoading={false} />)
    expect(screen.getByText('18 of 20')).toBeInTheDocument()
    expect(screen.getByText(/not what the kitchen actually uses/)).toBeInTheDocument()
  })

  it('states that it ignores the period selector', () => {
    render(<TopSpendItems view={VIEW} isLoading={false} />)
    expect(screen.getByText(/not affected by the period above/)).toBeInTheDocument()
  })

  it('does not badge "no BOM" while the BOM set is still loading', () => {
    const loadingBom = topSpendItems(ABC_ITEMS.map((r) => ({ ...r, has_bom: undefined })))
    render(<TopSpendItems view={loadingBom} isLoading={false} />)
    expect(screen.queryByText('no BOM')).not.toBeInTheDocument()
  })

  it('says so when nothing was bought', () => {
    render(
      <TopSpendItems
        view={{ items: [], stubCount: 0, classedCount: 0, noBomCount: 0 }}
        isLoading={false}
      />,
    )
    expect(screen.getByText('No purchases in the last 8 weeks')).toBeInTheDocument()
  })
})
