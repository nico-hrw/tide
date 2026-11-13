mod mcp;

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use std::io::{self, BufRead, Write};
use std::path::{Path, PathBuf};
use tide_core::crypto::unlock_vault;
use tide_core::sync::{load_session, save_session, SessionInfo, TideClient};
use tide_core::Database;

#[derive(Parser)]
#[command(name = "tide-daemon", version = "0.1.0", about = "Tide Local Harness & MCP Daemon")]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the Stdio MCP server for AI agents
    Mcp {
        #[arg(long, default_value = "~/.tide/local.db")]
        db_path: String,
    },
    /// Initialize local database
    Init {
        #[arg(long, default_value = "~/.tide/local.db")]
        db_path: String,
    },
    /// Log in, unlock vault with PIN, and sync notes & todos
    Login {
        #[arg(long)]
        email: Option<String>,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        pin: Option<String>,
        #[arg(long, default_value = "~/.tide/local.db")]
        db_path: String,
    },
    /// Sync notes and todos using existing session
    Sync {
        #[arg(long, default_value = "~/.tide/local.db")]
        db_path: String,
        #[arg(long)]
        pin: Option<String>,
    },
    /// Run daemon background service
    Run {
        #[arg(long, default_value = "~/.tide/local.db")]
        db_path: String,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Some(Commands::Mcp { db_path }) => {
            let path = resolve_db_path(&db_path)?;
            ensure_parent_dir(&path)?;
            let db = Database::open(&path)?;
            mcp::run_mcp_server(db).await?;
        }
        Some(Commands::Init { db_path }) => {
            let path = resolve_db_path(&db_path)?;
            ensure_parent_dir(&path)?;
            let _db = Database::open(&path)?;
            println!("Initialized Tide local database at {}", path.display());
        }
        Some(Commands::Login {
            email,
            password,
            pin,
            db_path,
        }) => {
            let path = resolve_db_path(&db_path)?;
            ensure_parent_dir(&path)?;
            let db = Database::open(&path)?;

            let email = match email {
                Some(e) => e,
                None => prompt_input("Email: ")?,
            };
            let password = match password {
                Some(p) => p,
                None => prompt_input("Password: ")?,
            };
            let pin = match pin {
                Some(p) => p,
                None => prompt_input("Vault PIN: ")?,
            };

            perform_login_and_sync(&email, &password, &pin, &db).await?;
        }
        Some(Commands::Sync { db_path, pin }) => {
            let path = resolve_db_path(&db_path)?;
            ensure_parent_dir(&path)?;
            let db = Database::open(&path)?;

            let pin = match pin {
                Some(p) => p,
                None => prompt_input("Vault PIN: ")?,
            };

            perform_sync_with_session(&pin, &db).await?;
        }
        Some(Commands::Run { db_path }) => {
            let path = resolve_db_path(&db_path)?;
            ensure_parent_dir(&path)?;
            let _db = Database::open(&path)?;
            println!("Tide daemon background service running for {}", path.display());
            tokio::signal::ctrl_c().await?;
        }
        None => {
            run_interactive_menu().await?;
        }
    }

    Ok(())
}

async fn run_interactive_menu() -> Result<()> {
    let path = resolve_db_path("~/.tide/local.db")?;
    ensure_parent_dir(&path)?;
    let db = Database::open(&path)?;

    loop {
        println!("\n=============================================");
        println!("          TIDE LOCAL HARNESS & MCP           ");
        println!("=============================================");
        println!("[1] Login & Sync Notes (Email + Password + PIN)");
        println!("[2] Sync Notes & Todos (with saved session)");
        println!("[3] Start Stdio MCP Server (for AI agents)");
        println!("[4] Exit");
        print!("\nSelect an option [1-4]: ");
        io::stdout().flush()?;

        let mut choice = String::new();
        io::stdin().read_line(&mut choice)?;
        let choice = choice.trim();

        match choice {
            "1" => {
                let email = prompt_input("Email: ")?;
                let password = prompt_input("Password: ")?;
                let pin = prompt_input("Vault PIN: ")?;

                if let Err(e) = perform_login_and_sync(&email, &password, &pin, &db).await {
                    eprintln!("\n[Error during login & sync]: {}", e);
                }
                prompt_input("\nPress Enter to continue...")?;
            }
            "2" => {
                let pin = prompt_input("Vault PIN: ")?;
                if let Err(e) = perform_sync_with_session(&pin, &db).await {
                    eprintln!("\n[Error during sync]: {}", e);
                }
                prompt_input("\nPress Enter to continue...")?;
            }
            "3" => {
                println!("\nStarting Stdio MCP Server. Listening for JSON-RPC on stdin...");
                mcp::run_mcp_server(db).await?;
                break;
            }
            "4" | "exit" | "q" => {
                println!("Goodbye!");
                break;
            }
            _ => {
                println!("Invalid choice. Please enter 1, 2, 3, or 4.");
            }
        }
    }

    Ok(())
}

async fn perform_login_and_sync(
    email: &str,
    password: &str,
    pin: &str,
    db: &Database,
) -> Result<()> {
    println!("\nConnecting to Tide Cloud (https://hrw.rocks)...");
    let mut client = TideClient::default();
    let (user_id, encrypted_vault_json) = client.login(email, password).await?;
    println!("Login successful! User ID: {}", user_id);

    println!("Deriving keys and unlocking RSA Master Vault (600,000 PBKDF2 iterations)...");
    let private_key = unlock_vault(pin, &encrypted_vault_json)
        .context("Failed to unlock vault. Check your PIN.")?;
    println!("Master Vault unlocked successfully!");

    let session = SessionInfo {
        base_url: Some("https://hrw.rocks/api/v1".to_string()),
        email: Some(email.to_string()),
        user_id: user_id.clone(),
        token: client.token.clone().unwrap_or_default(),
        encrypted_vault: Some(encrypted_vault_json.clone()),
    };
    save_session(&session)?;

    println!("Downloading and decrypting notes and todos...");
    let (notes_count, todos_count) = client.sync_notes_and_todos(&private_key, db).await?;

    println!("\nSUCCESS!");
    println!("- Decrypted & synced notes: {}", notes_count);
    println!("- Synced todos:            {}", todos_count);
    println!("- Local database:          ~/.tide/local.db");

    Ok(())
}

async fn perform_sync_with_session(pin: &str, db: &Database) -> Result<()> {
    let session = load_session()?.context("No saved session found. Please run login first.")?;
    let mut client = TideClient::new(session.base_url.clone());
    client = client.with_auth(session.token.clone(), session.user_id.clone());

    let vault_json = session
        .encrypted_vault
        .as_deref()
        .context("No encrypted vault found in session.")?;

    println!("Unlocking RSA Master Vault...");
    let private_key = unlock_vault(pin, vault_json)
        .context("Failed to unlock vault with provided PIN.")?;

    println!("Syncing notes and todos...");
    let (notes_count, todos_count) = client.sync_notes_and_todos(&private_key, db).await?;

    println!("\nSUCCESS: Synced {} notes and {} todos.", notes_count, todos_count);
    Ok(())
}

fn prompt_input(prompt: &str) -> Result<String> {
    print!("{}", prompt);
    io::stdout().flush()?;
    let mut buffer = String::new();
    io::stdin().read_line(&mut buffer)?;
    Ok(buffer.trim().to_string())
}

fn resolve_db_path(raw: &str) -> Result<PathBuf> {
    if raw.starts_with("~/") || raw.starts_with("~\\") {
        let home = std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .unwrap_or_else(|_| ".".to_string());
        Ok(PathBuf::from(home).join(&raw[2..]))
    } else {
        Ok(PathBuf::from(raw))
    }
}

fn ensure_parent_dir(path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    Ok(())
}
