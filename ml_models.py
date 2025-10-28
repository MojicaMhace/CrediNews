import os
import glob
import re
import random
from typing import List, Optional, Tuple

import numpy as np
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer, CountVectorizer
from sklearn.decomposition import TruncatedSVD
from sklearn.pipeline import make_pipeline
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.ensemble import RandomForestClassifier
from sklearn.naive_bayes import MultinomialNB


DATA_ROOT = os.path.join(os.path.dirname(__file__), 'data')
PFNC_DIR = os.path.join(DATA_ROOT, 'Philippine-Fake-News-Corpus')
SLANG_PATH = os.path.join(DATA_ROOT, 'filipino_slang_words.txt')


def _find_pfnc_csv() -> Optional[str]:
    """Find a CSV file inside the Philippine-Fake-News-Corpus directory."""
    pattern = os.path.join(PFNC_DIR, '**', '*.csv')
    files = glob.glob(pattern, recursive=True)
    return files[0] if files else None


def _select_text_and_label_columns(df: pd.DataFrame) -> Tuple[str, str]:
    """Heuristically pick text and label columns."""
    text_candidates = ['text', 'content', 'body', 'article', 'headline']
    label_candidates = ['label', 'category', 'target', 'is_fake', 'verdict', 'class']

    text_col = next((c for c in text_candidates if c in df.columns), None)
    label_col = next((c for c in label_candidates if c in df.columns), None)

    # Fallbacks
    if text_col is None:
        # Pick the longest average-length string column
        str_cols = [c for c in df.columns if df[c].dtype == 'object']
        if str_cols:
            text_col = max(str_cols, key=lambda c: df[c].astype(str).str.len().mean())
    if label_col is None:
        # Pick a low-cardinality column
        label_col = min(df.columns, key=lambda c: df[c].nunique())

    if text_col is None or label_col is None:
        raise ValueError('Unable to determine text/label columns from dataset.')

    return text_col, label_col


def _normalize_labels(series: pd.Series) -> pd.Series:
    """Map labels to {'fake', 'real'} if possible, else keep as-is."""
    s = series.astype(str).str.strip().str.lower()
    unique = set(s.unique())

    mapping = None
    if {'fake', 'real'}.issubset(unique):
        mapping = {'fake': 'fake', 'real': 'real'}
    elif {'true', 'false'}.issubset(unique):
        mapping = {'false': 'fake', 'true': 'real'}
    elif {'1', '0'}.issubset(unique):
        mapping = {'1': 'fake', '0': 'real'}

    return s.map(mapping) if mapping else s


def load_pfnc_dataset() -> Optional[pd.DataFrame]:
    """Load the Philippine Fake News Corpus dataset as a DataFrame with 'text' and 'label'."""
    csv_path = _find_pfnc_csv()
    if not csv_path:
        print(f"PFNC CSV not found under: {PFNC_DIR}")
        return None

    df = pd.read_csv(csv_path, encoding='utf-8', errors='ignore')
    text_col, label_col = _select_text_and_label_columns(df)
    df = df[[text_col, label_col]].rename(columns={text_col: 'text', label_col: 'label'})
    df['label'] = _normalize_labels(df['label'])

    # Drop rows with missing values
    df = df.dropna(subset=['text', 'label'])
    print(f"Loaded PFNC: {csv_path} | rows={len(df)} | columns={list(df.columns)}")
    print(df['label'].value_counts())
    return df


def visualize_label_distribution(labels: pd.Series, title: str):
    ax = sns.countplot(x=labels)
    ax.set_title(title)
    ax.set_xlabel('Class')
    ax.set_ylabel('Count')
    plt.tight_layout()
    plt.show()


def visualize_confusion_matrix(y_true, y_pred, labels: List[str], title: str):
    cm = confusion_matrix(y_true, y_pred, labels=labels)
    cm_df = pd.DataFrame(cm, index=labels, columns=labels)
    ax = sns.heatmap(cm_df, annot=True, fmt='d', cmap='Blues')
    ax.set_title(title)
    ax.set_xlabel('Predicted')
    ax.set_ylabel('Actual')
    plt.tight_layout()
    plt.show()


def train_random_forest_on_pfnc():
    """Train a Random Forest news credibility classifier on the PFNC dataset."""
    df = load_pfnc_dataset()
    if df is None:
        return

    # Basic visualization of class distribution
    visualize_label_distribution(df['label'], 'PFNC Class Distribution')

    X_train, X_test, y_train, y_test = train_test_split(
        df['text'].astype(str), df['label'].astype(str), test_size=0.2, random_state=42, stratify=df['label']
    )

    # Vectorize -> Reduce dimension -> Random Forest
    tfidf = TfidfVectorizer(ngram_range=(1, 2), max_features=10000, min_df=2)
    svd = TruncatedSVD(n_components=300, random_state=42)
    rf = RandomForestClassifier(n_estimators=300, random_state=42, class_weight='balanced')

    pipeline = make_pipeline(tfidf, svd, rf)
    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)
    print('\nRandom Forest on PFNC — Classification Report')
    print(classification_report(y_test, y_pred))

    visualize_confusion_matrix(y_test, y_pred, labels=sorted(df['label'].unique()),
                               title='PFNC Random Forest Confusion Matrix')


def _tokenize_words(text: str) -> List[str]:
    # Basic tokenizer for Filipino/English words
    return [t.lower() for t in re.findall(r"[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\-']+", text)]


def load_slang_words() -> List[str]:
    if os.path.exists(SLANG_PATH):
        with open(SLANG_PATH, 'r', encoding='utf-8', errors='ignore') as f:
            words = [w.strip().lower() for w in f if w.strip()]
            print(f"Loaded slang words: {len(words)} from {SLANG_PATH}")
            return words
    # Fallback: small placeholder list (replace with your dataset)
    fallback = ['werpa', 'lodi', 'petmalu', 'sanaol', 'charot', 'jowa']
    print(f"Slang file not found at {SLANG_PATH}. Using fallback list: {fallback}")
    return fallback


def build_slang_dataset_from_corpus(slang_words: List[str], df_pfnc: Optional[pd.DataFrame]) -> pd.DataFrame:
    """Create a token-level dataset: slang vs non_slang.
    Negative samples are drawn from PFNC corpus tokens not in slang list.
    """
    slang_words = list({w.lower() for w in slang_words})
    pos = pd.DataFrame({'word': slang_words, 'label': 'slang'})

    neg_words: List[str] = []
    if df_pfnc is not None:
        for txt in df_pfnc['text'].astype(str).tolist():
            for tok in _tokenize_words(txt):
                if tok not in slang_words and tok.isalpha() and len(tok) >= 3:
                    neg_words.append(tok)
        # Deduplicate and sample to balance
        neg_words = list({w for w in neg_words})
        random.seed(42)
        random.shuffle(neg_words)
        neg_words = neg_words[:len(slang_words)] if neg_words else []

    # Fallback negatives if corpus is missing/too small
    if not neg_words:
        neg_words = ['bahay', 'trabaho', 'balita', 'guro', 'paaralan', 'kape'][:len(slang_words)]

    neg = pd.DataFrame({'word': neg_words, 'label': 'non_slang'})
    ds = pd.concat([pos, neg], axis=0).sample(frac=1.0, random_state=42).reset_index(drop=True)
    print(f"Slang dataset built — rows={len(ds)} | slang={len(pos)} | non_slang={len(neg)}")
    return ds


def train_naive_bayes_for_slang():
    """Train a Naive Bayes classifier to detect Filipino slang words."""
    df_pfnc = load_pfnc_dataset()
    slang_words = load_slang_words()
    ds = build_slang_dataset_from_corpus(slang_words, df_pfnc)

    visualize_label_distribution(ds['label'], 'Slang Dataset Class Distribution')

    X_train, X_test, y_train, y_test = train_test_split(
        ds['word'].astype(str), ds['label'].astype(str), test_size=0.2, random_state=42, stratify=ds['label']
    )

    # Character n-grams often work well for short tokens
    vec = TfidfVectorizer(analyzer='char', ngram_range=(3, 5))
    nb = MultinomialNB()
    pipeline = make_pipeline(vec, nb)
    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)
    print('\nNaive Bayes for Slang — Classification Report')
    print(classification_report(y_test, y_pred))

    visualize_confusion_matrix(y_test, y_pred, labels=sorted(ds['label'].unique()),
                               title='Slang Naive Bayes Confusion Matrix')

    # Show top char-ngrams per class (interpretability)
    vec_fit = vec.fit(X_train)
    X_train_vec = vec_fit.transform(X_train)
    nb_fit = MultinomialNB().fit(X_train_vec, y_train)
    feature_names = np.array(vec_fit.get_feature_names_out())
    for i, cls in enumerate(nb_fit.classes_):
        top_idx = np.argsort(nb_fit.class_log_prior_[i] + nb_fit.feature_log_prob_[i])[-15:]
        print(f"Top n-grams for class={cls}: {feature_names[top_idx]}")


def main():
    sns.set_theme(style='whitegrid')
    print('--- Training Random Forest on PFNC ---')
    train_random_forest_on_pfnc()

    print('\n--- Training Naive Bayes for Filipino Slang ---')
    train_naive_bayes_for_slang()


if __name__ == '__main__':
    main()