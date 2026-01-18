from googlesearch import search

print("Testing Google Search Library...")

try:
    # We use 'advanced=True' because that is the specific feature 
    # that ONLY exists in 'googlesearch-python'.
    # If you have the wrong library, this specific line will crash.
    results = search("Ben&Ben Facebook", num_results=1, advanced=True)
    
    for r in results:
        print(f"✅ SUCCESS! Library is working. Found: {r.title}")
        break
        
except TypeError as e:
    print("❌ ERROR: You still have the WRONG library active.")
    print("The error 'unexpected keyword argument advanced' means Python is using the old 'google' library instead of 'googlesearch-python'.")
    print("FIX: Run 'pip uninstall google' and 'pip uninstall googlesearch-python', then reinstall only googlesearch-python.")
except Exception as e:
    print(f"⚠️ Other Error: {e}")