from flask import Flask, render_template
import os

app = Flask(__name__, template_folder="../frontend")  # point to frontend folder

@app.route("/")
def home():
    return render_template("index.html")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)