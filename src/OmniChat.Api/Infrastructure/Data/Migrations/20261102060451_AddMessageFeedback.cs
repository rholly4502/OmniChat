using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OmniChat.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddMessageFeedback : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Feedback",
                table: "Messages",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Feedback",
                table: "Messages");
        }
    }
}
