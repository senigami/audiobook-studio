# Model / View / Presenter for components

Read this for the *how* behind pillar 2: splitting a tangled component, the
React mapping, and how MVP relates to MVC/MVVM.

## The three roles

- **Model** — the data and the rules about it. Types, validation schemas, the
  API client, server/cache state. Pure data; no knowledge of the screen.
- **Presenter** — the translator between model and view. It pulls model data,
  shapes it into exactly the props the view needs (formatting dates, money,
  counts; computing derived flags), and converts view events (clicks, submits)
  into model operations. **All conditional/business logic lives here.**
- **View** — presentation only. Takes plain props, renders markup + tokens,
  raises callbacks. No fetching, no formatting, almost no branching.

The point isn't ceremony — it's that each role can change for one reason:
the model when the data changes, the presenter when the behavior changes, the
view when the *look* changes. That last one is what makes reskinning (pillar 1)
safe: you can rewrite the view's markup without fear because no logic lives
there.

## React mapping

| Role | React form |
| --- | --- |
| Model | `types.ts`, Zod schemas, API client, query hooks (`useQuery` wrappers) |
| Presenter | custom hooks (`useInvoiceList`), container components, pure formatter fns |
| View | presentational components that take **only props** |

### Before — one component does everything

```tsx
function InvoiceList() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/invoices')
      .then((r) => r.json())
      .then((d) => { setInvoices(d); setLoading(false); });
  }, []);

  if (loading) return <Spinner />;
  return (
    <ul className="flex flex-col gap-2">
      {invoices.map((inv) => (
        <li key={inv.id} className="text-foreground">
          {inv.customer} — ${(inv.cents / 100).toFixed(2)} —{' '}
          {new Date(inv.createdAt).toLocaleDateString()}
        </li>
      ))}
    </ul>
  );
}
```

Fetching, formatting (`cents / 100`, date), state, *and* markup are fused. You
can't test the formatting without rendering, and you can't restyle without
reading past the data logic.

### After — split along MVP

```tsx
// model — types.ts
export interface Invoice { id: string; customer: string; cents: number; createdAt: string }

// presenter — useInvoiceList.ts (fetch + shape into view props)
export interface InvoiceRow { id: string; customer: string; amount: string; date: string }

export function useInvoiceList(): { rows: InvoiceRow[]; status: 'loading' | 'error' | 'ready' } {
  const { data, isLoading, isError } = useQuery({ queryKey: ['invoices'], queryFn: fetchInvoices });
  if (isLoading) return { rows: [], status: 'loading' };
  if (isError) return { rows: [], status: 'error' };
  return {
    status: 'ready',
    rows: (data ?? []).map((inv) => ({
      id: inv.id,
      customer: inv.customer,
      amount: formatCurrency(inv.cents),       // pure, unit-testable
      date: formatDate(inv.createdAt),
    })),
  };
}

// view — InvoiceList.tsx (props only; renders all four states)
export function InvoiceList({ rows, status }: { rows: InvoiceRow[]; status: Status }) {
  if (status === 'loading') return <Spinner />;
  if (status === 'error') return <Alert>Couldn’t load invoices.</Alert>;
  if (rows.length === 0) return <Empty>No invoices yet.</Empty>;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.id} className="text-foreground">
          {r.customer} — {r.amount} — {r.date}
        </li>
      ))}
    </ul>
  );
}

// composition — the container wires presenter to view
export function InvoiceListContainer() {
  const { rows, status } = useInvoiceList();
  return <InvoiceList rows={rows} status={status} />;
}
```

Now:
- `formatCurrency` / `formatDate` are pure functions — test them with no render.
- `useInvoiceList` can be tested by mocking the query and asserting the rows.
- `InvoiceList` renders from props alone — drop it in Storybook or a test with
  no network, and **restyle it freely** without touching any logic.

## How much structure is enough

Don't manufacture three files for a button. The split earns its keep when a
component has *real* logic — fetching, non-trivial formatting, multiple states,
branching. A rule of thumb: the moment you're tempted to write a test that has
to render the component just to check a calculation, that calculation wants to
move to a presenter.

## Relation to MVC / MVVM

Same spine — *separate data, presentation logic, and rendering* — different
emphasis:

- **MVC**: controller mediates; view often reads the model directly. Older,
  looser about who formats.
- **MVVM**: the ViewModel exposes bindable, view-shaped state; the view binds to
  it. Very close to "presenter hook returns view props" in React.
- **MVP** (this doc): the presenter fully owns view-prep; the view is maximally
  passive ("humble view"). This is the cleanest fit for component frameworks
  because it makes the view a pure prop→markup function.

Pick the vocabulary your team uses; the value is the separation, not the acronym.
