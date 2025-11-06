import os
import sys
import json
import joblib
from sklearn.metrics import classification_report, accuracy_score
from sklearn.model_selection import train_test_split

# Ensure project root is on sys.path so ml_models can be imported
PROJECT_ROOT = os.path.dirname(os.path.dirname(__file__))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

try:
    from ml_models import load_top_level_corpus, MODEL_DIR
except Exception as e:
    raise RuntimeError(f"Failed to import ml_models from {PROJECT_ROOT}: {e}")


def main():
    df = load_top_level_corpus()
    if df is None:
        raise SystemExit('Top-level corpus not found under data/.')

    X_train, X_test, y_train, y_test = train_test_split(
        df['text'], df['label'], test_size=0.2, random_state=42,
        stratify=df['label'] if df['label'].nunique() > 1 else None
    )

    model_path = os.path.join(MODEL_DIR, 'news_lr_pipeline.joblib')
    if not os.path.exists(model_path):
        raise SystemExit(f'Model not found at {model_path}; run ml_models.py first.')
    pipe = joblib.load(model_path)

    y_pred = pipe.predict(X_test)
    acc = float(accuracy_score(y_test, y_pred))
    rep = classification_report(y_test, y_pred, output_dict=True)
    precision_macro = float(rep.get('macro avg', {}).get('precision', 0.0))
    recall_macro = float(rep.get('macro avg', {}).get('recall', 0.0))
    f1_macro = float(rep.get('macro avg', {}).get('f1-score', 0.0))

    metrics_path = os.path.join(MODEL_DIR, 'news_lr_metrics.json')
    if not os.path.exists(metrics_path):
        data = {}
    else:
        with open(metrics_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    data.setdefault('metrics', {})
    data['metrics'].update({
        'accuracy': acc,
        'precision': precision_macro,
        'recall': recall_macro,
        'f1': f1_macro,
    })
    with open(metrics_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print('Updated metrics:', data['metrics'])


if __name__ == '__main__':
    main()