<?php
$host = 'localhost';
$dbname = 'credinews_db';
$username = 'root';
$password = '';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    die("Connection failed: " . $e->getMessage());
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CrediNews - Login & Sign Up</title>
    <link rel="stylesheet" href="style.css">
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
    <header>
        <div class="header-container">
            <a href="#" class="logo">CrediNews</a>
            <div class="user-auth">
                <button type="button" class="login-btn-modal">Log In</button>
            </div>
        </div>
    </header>
    <div class="container">
        <!-- Login Form -->
        <div id="login-form">
            <h2>Login</h2>
            <form>
                <input type="email" placeholder="Email" required>
                <input type="password" placeholder="Password" required>
                <button type="submit">Login</button>
            </form>
            <div class="toggle-link" onclick="showSignUp()">Don't have an account? Sign Up</div>
        </div>
        </header>
        
        <!-- Sign Up Form -->
        <div id="signup-form" style="display:none;">
            <h2>Sign Up</h2>
            <form>
                <input type="text" placeholder="Username" required>
                <input type="email" placeholder="Email" required>
                <input type="password" placeholder="Password" required>
                <button type="submit">Sign Up</button>
            </form>
            <div class="toggle-link" onclick="showLogin()">Already have an account? Login</div>
        </div>
    </div>
    <script>
        function showSignUp() {
            document.getElementById('login-form').style.display = 'none';
            document.getElementById('signup-form').style.display = 'block';
        }
        function showLogin() {
            document.getElementById('signup-form').style.display = 'none';
            document.getElementById('login-form').style.display = 'block';
        }
    </script>
</body>
</html>