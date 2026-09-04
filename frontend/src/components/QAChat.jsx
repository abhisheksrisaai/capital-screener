import { useState } from 'react';
import { MessageCircle, Send, Loader } from 'lucide-react';
import { apiErrorMessage, askQuestion } from '../services/api';

const EXAMPLES = [
  'What are the key business risks mentioned in filings?',
  'How has revenue growth trended?',
  'What is management focus for the upcoming year?',
];

export default function QAChat({ companyId }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAsk = async (q) => {
    const query = q || question.trim();
    if (!query) return;
    setLoading(true);
    setError('');
    setAnswer('');
    try {
      const result = await askQuestion(companyId, query);
      setAnswer(result.answer);
      setSources(result.sources || []);
      setQuestion('');
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to get answer'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-5">
      <h3 className="font-semibold flex items-center gap-2 mb-4">
        <MessageCircle className="w-5 h-5 text-blue-400" />
        Filing Q&A
      </h3>

      <div className="flex flex-wrap gap-2 mb-3">
        {EXAMPLES.map((ex) => (
          <button key={ex} onClick={() => handleAsk(ex)} className="btn-secondary text-xs" disabled={loading}>
            {ex}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
          placeholder="Ask about this company's filings..."
        />
        <button onClick={() => handleAsk()} disabled={loading} className="btn-primary flex items-center gap-2">
          {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Ask
        </button>
      </div>

      {error && <p className="text-red-400 text-sm mt-3">{error}</p>}

      {answer && (
        <div className="mt-4 p-4 bg-slate-800/50 rounded-lg">
          <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">{answer}</p>
          {sources.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-700">
              <p className="text-xs text-slate-400 mb-2">Sources</p>
              {sources.map((s, i) => (
                <p key={i} className="text-xs text-slate-500">
                  [{s.doc_title}, p.{s.page}] — {s.excerpt?.slice(0, 120)}...
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
