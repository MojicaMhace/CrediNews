import fasttext
import os

base_dir = os.path.dirname(__file__)
candidates = [
    os.path.join(base_dir, "data", "phrases.txt"),
]

train_file = None
for p in candidates:
    if os.path.isfile(p):
        train_file = p
        break

if not train_file:
    raise ValueError(
        "No training file found. Expected one of: "
        + ", ".join(candidates)
    )

print(f"Using training data: {train_file}")

# Train supervised FastText model
model = fasttext.train_supervised(
    input=train_file,
    epoch=25,        
    lr=1.0,          
    wordNgrams=2,    
    verbose=2,
    minCount=1
)

# Save the model in the same directory as script
model_path = os.path.join(base_dir, "filipino_phrases.bin")
model.save_model(model_path)

print("Training complete! Model saved at:", model_path)
