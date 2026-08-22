fn main() {
    let entry = keyring::Entry::new("com.gitbud.app", "Daanieeel").unwrap();
    println!("Has password: {}", entry.get_password().is_ok());
}
