import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-ink-100 text-ink-400">
        <Compass className="h-7 w-7" />
      </div>
      <h2 className="text-xl font-semibold text-ink-800">Page not found</h2>
      <p className="max-w-sm text-sm text-ink-500">The page you requested does not exist or was moved.</p>
      <Link to="/dashboard">
        <Button variant="outline">Go to dashboard</Button>
      </Link>
    </div>
  );
}
