import pandas as pd
import pickle
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split

# Simulate a dataset with the exact features expected by app.py
data = {
    'qty_dot_url': [2, 3, 1, 4, 2],
    'qty_hyphen_url': [0, 1, 0, 2, 0],
    'qty_underline_url': [0, 0, 0, 0, 0],
    'qty_slash_url': [2, 3, 1, 4, 2],
    'qty_questionmark_url': [0, 1, 0, 0, 0],
    'qty_equal_url': [0, 1, 0, 0, 0],
    'qty_at_url': [0, 0, 0, 0, 0],
    'qty_and_url': [0, 1, 0, 0, 0],
    'qty_dot_domain': [1, 2, 1, 2, 1],
    'qty_hyphen_domain': [0, 1, 0, 0, 0],
    'length_domain': [10, 15, 8, 20, 12],
    'length_path': [5, 10, 3, 15, 7],
    'ip_in_domain': [0, 0, 0, 0, 0],
    'https': [1, 0, 1, 0, 1],
    'domain_age': [1000, 30, 500, 10, 2000],
    'is_phishing': [0, 1, 0, 1, 0]  # Target variable
}
df = pd.DataFrame(data)

# Features and target
X = df.drop('is_phishing', axis=1)
y = df['is_phishing']

# Split the data
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Train a simple RandomForest model
model = RandomForestClassifier(random_state=42)
model.fit(X_train, y_train)

# Save the model to phishing.pkl
with open('phishing.pkl', 'wb') as f:
    pickle.dump(model, f)

print("Model trained and saved as phishing.pkl")